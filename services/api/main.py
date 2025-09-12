# services/api/main.py
import os
import uuid
import logging
import queue
import uvicorn
from typing import Any, Dict

from fastapi import FastAPI, File, UploadFile, Header, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware
import numpy as np


from services.model.gwm import GenerativeWorldModel
from services.model.counterfactual import CounterfactualEngine
from services.model.intrinsic import IntrinsicMotivation
from services.model.consolidation import ConsolidationWorker
from services.model.teacher import TeacherAPI
from services.model.concept_graph import ConceptGraph
from services.model.proto_memory import ProtoMemory
from services.model.memory_log import MemoryLogger
from services.model.encoders import MultiModalEncoders
from services.model.experts import ExpertRouter

# --------------------------------------------------
# إعدادات بسيطة
# --------------------------------------------------
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger_py = logging.getLogger("cmsh.api")

API_KEY = os.getenv("API_KEY", "changeme")
# Default 4 MiB unless overridden
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", 4 * 1024 * 1024))

# CORS origins parsing (handle empty string safely)
_raw_origins = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
if _raw_origins == "" or _raw_origins == "*":
    _allow_origins = ["*"]
else:
    _allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app = FastAPI(title="CMSH Production API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------
# Instances / singletons used by endpoints & workers
# --------------------------------------------------
task_queue = queue.Queue()
memory_logger = MemoryLogger()
cg = ConceptGraph()
pm = ProtoMemory()
gwm = GenerativeWorldModel()
cf = CounterfactualEngine()
intrinsic = IntrinsicMotivation()
encoders = MultiModalEncoders()
experts = ExpertRouter(logger=memory_logger)
consolidation_worker = ConsolidationWorker(task_queue, logger=memory_logger)
consolidation_worker.start()
teacher = TeacherAPI(cg, pm, api_key=API_KEY)

# Helper to safely call logger methods if present
def safe_log_event(event_type: str, payload: Dict[str, Any]):
    try:
        if hasattr(memory_logger, "log_event") and callable(memory_logger.log_event):
            memory_logger.log_event(event_type, payload)
        else:
            logger_py.debug("memory_logger has no log_event method; event: %s %s", event_type, payload)
    except Exception:
        logger_py.exception("Failed to log event to memory_logger")

# --------------------------------------------------
# Security dependency
# --------------------------------------------------
def get_api_key(x_api_key: str = Header(None, alias="X-API-KEY")):
    """
    Dependency to enforce API key header "X-API-KEY".
    Raises 403 if missing/invalid.
    """
    if x_api_key != API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return x_api_key

# --------------------------------------------------
# Exception handler
# --------------------------------------------------
@app.exception_handler(Exception)
async def exception_handler(request: Request, exc: Exception):
    logger_py.exception("Unhandled exception on %s %s", request.method, request.url)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": exc.__class__.__name__},
    )

# --------------------------------------------------
# Health + Metrics
# --------------------------------------------------
@app.get("/health")
def health():
    """
    Basic health endpoint used by GUI / CI.
    """
    return {"status": "ok", "weights_state": "n/a", "faiss_ok": True}


@app.get("/metrics")
def metrics():
    """
    Simple system metrics - this is a stub.
    Replace or extend with Prometheus exporter or more detailed metrics.
    """
    try:
        import psutil  # optional dependency for runtime metrics
    except Exception:
        return {"cpu_percent": 0.0, "memory_percent": 0.0, "queue_len": task_queue.qsize()}

    return {
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent,
        "queue_len": task_queue.qsize(),
    }

# --------------------------------------------------
# API payload models
# --------------------------------------------------
class EncodeInput(BaseModel):
    input: str
    modality: str = "auto"


class AssignInput(BaseModel):
    embedding: list
    modality: str


class DreamInput(BaseModel):
    concept_id: str
    T: int = 16


class TeachInput(BaseModel):
    concept_label: str
    bundle: dict
    relations: list = []
    teacher_id: str = None

# --------------------------------------------------
# Core endpoints (encode / assign / concept / experts / gwm / ...)
# --------------------------------------------------
@app.post("/encode")
def encode(input: EncodeInput, api_key: str = Depends(get_api_key)):
    arr = encoders.encode(input.input, modality=input.modality)
    # ensure numpy array -> list
    return {"embedding": arr.tolist()}


@app.post("/assign")
def assign(input: AssignInput, api_key: str = Depends(get_api_key)):
    proto_id = pm.assign(np.array(input.embedding, dtype=np.float32), input.modality)
    return {"proto_id": proto_id}


@app.get("/concept/{proto_id}")
def get_concept(proto_id: str, api_key: str = Depends(get_api_key)):
    # Get concept node for proto
    for cid, data in cg.G.nodes(data=True):
        if proto_id in data.get("proto_refs", []):
            return {"concept_id": cid, **data}
    raise HTTPException(status_code=404, detail="Not found")


@app.post("/expert/run")
def run_expert(concept_id: str, input_data: str, modality: str = "auto", api_key: str = Depends(get_api_key)):
    expert = experts.select(concept_id, input_data, modality)
    result = expert.process(input_data, concept_id)
    return result


@app.post("/gwm/dream")
def dream(input: DreamInput, api_key: str = Depends(get_api_key)):
    latents = gwm.generate(input.concept_id, T=input.T)
    return {"latents": latents.tolist()}


@app.post("/counterfactual/simulate")
def simulate(seqs: list, api_key: str = Depends(get_api_key)):
    np_seqs = [np.array(s, dtype=np.float32) for s in seqs]
    results = cf.simulate(np_seqs)
    return {"results": results}


@app.post("/intrinsic/compute")
def compute_intrinsic(concept_id: str, embedding: list, api_key: str = Depends(get_api_key)):
    arr = np.array(embedding, dtype=np.float32)
    total, details = intrinsic.compute(arr, concept_id)
    return {"intrinsic_reward": total, "details": details}


@app.post("/consolidation/trigger")
def trigger_consolidation(job: dict, api_key: str = Depends(get_api_key)):
    """
    Generic job enqueuer used by GUI or other services.
    Example job: {"type": "export_logs", ...}
    """
    job["trace_id"] = job.get("trace_id") or str(uuid.uuid4())
    task_queue.put(job)
    safe_log_event("consolidation_trigger", {"job": job})
    return {"enqueued": True, "trace_id": job["trace_id"]}

# --------------------------------------------------
# Administrative endpoints expected by GUI (Restart / Export)
# --------------------------------------------------
@app.post("/restart")
def restart_worker(api_key: str = Depends(get_api_key)):
    """
    Enqueue a restart command. The actual restart should be handled by a worker process.
    This avoids the API process killing itself or executing unsafe operations.
    """
    job = {"type": "admin_restart", "trace_id": str(uuid.uuid4())}
    task_queue.put(job)
    safe_log_event("admin_command", {"cmd": "restart", "trace_id": job["trace_id"]})
    logger_py.info("Enqueued admin_restart job: %s", job["trace_id"])
    return {"status": "ok", "message": "restart enqueued", "trace_id": job["trace_id"]}


@app.post("/export-logs")
def export_logs(api_key: str = Depends(get_api_key)):
    """
    Enqueue a job to export logs (worker should create an archive and/or provide a download URL).
    """
    job = {"type": "export_logs", "trace_id": str(uuid.uuid4())}
    task_queue.put(job)
    safe_log_event("admin_command", {"cmd": "export_logs", "trace_id": job["trace_id"]})
    logger_py.info("Enqueued export_logs job: %s", job["trace_id"])
    return {"status": "ok", "message": "export started", "trace_id": job["trace_id"]}

# --------------------------------------------------
# Teacher endpoint (keeps original behavior; forwards headers to teacher)
# --------------------------------------------------
@app.post("/teacher/teach")
def teach(input: TeachInput, request: Request, api_key: str = Depends(get_api_key)):
    headers = dict(request.headers)
    return teacher.teach(input.concept_label, input.bundle, input.relations, headers=headers, teacher_id=input.teacher_id)

# --------------------------------------------------
# Upload endpoint
# --------------------------------------------------
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), api_key: str = Depends(get_api_key)):
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large (>{MAX_UPLOAD_SIZE} bytes)")
    os.makedirs("data/uploads", exist_ok=True)
    fname = f"data/uploads/{uuid.uuid4().hex}_{file.filename}"
    with open(fname, "wb") as f:
        f.write(contents)
    safe_log_event("file_upload", {"file": fname, "size": len(contents)})
    return {"saved_as": fname, "size": len(contents)}

# --------------------------------------------------
# Run server (only when executed directly)
# --------------------------------------------------
if __name__ == "__main__":
    # Note: in production when using docker-compose you likely run via uvicorn command,
    # e.g. `uvicorn services.api.main:app --host 0.0.0.0 --port 8500`
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("API_PORT", 8500)), proxy_headers=True)