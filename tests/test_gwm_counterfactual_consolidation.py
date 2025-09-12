from services.model.gwm import GenerativeWorldModel
from services.model.counterfactual import CounterfactualEngine
from services.model.consolidation import ConsolidationWorker
from services.model.memory_log import MemoryLogger
import queue
import os
import numpy as np
import time
import glob

def test_gwm_and_counterfactual_and_consolidation(tmp_path):
    gwm = GenerativeWorldModel(latent_dim=8, seed=123)
    cf = CounterfactualEngine()
    logger = MemoryLogger(path=str(tmp_path / "memlog.jsonl"))
    q = queue.Queue()
    worker = ConsolidationWorker(q, artifact_dir=str(tmp_path), logger=logger)
    worker.start()
    concept_id = "c_00001"
    latents = [gwm.generate(concept_id, T=8) for _ in range(4)]
    cf_results = cf.simulate(latents)
    trace_id = "testtrace"
    job = {"concept_id": concept_id, "reward": 0.99, "trace_id": trace_id}
    q.put(job)
    time.sleep(2)
    worker.stop()
    worker.join(timeout=2)
    artifacts = list(glob.glob(str(tmp_path / f"consolidation_{trace_id}.json")))
    assert artifacts, "Artifact not found"
    with open(artifacts[0], "r", encoding="utf-8") as f:
        data = f.read()
        assert "consolidated" in data
    # Check memory log for events
    with open(str(tmp_path / "memlog.jsonl"), "r", encoding="utf-8") as f:
        logs = f.readlines()
        assert any("consolidation_started" in l for l in logs)
        assert any("consolidation_finished" in l for l in logs)