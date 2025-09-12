import os, json, time, hashlib, uuid

class MemoryLogger:
    def __init__(self, path="data/logs/memory_log.jsonl"):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.path = path

    def log_event(self, event_type, proto_id=None, concept_id=None, expert=None, reward=None, input_data=None, meta=None, trace_id=None, service="model", level="INFO"):
        ihash = hashlib.sha256(str(input_data).encode("utf-8")).hexdigest()[:10] if input_data else None
        rec = {
            "ts": time.time(),
            "service": service,
            "level": level,
            "event": event_type,
            "input_hash": ihash,
            "proto_id": proto_id,
            "concept_id": concept_id,
            "expert": expert,
            "reward": reward,
            "meta": meta or {},
            "trace_id": trace_id or str(uuid.uuid4())
        }
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    def sync_proto_metadata(self, protos):
        path = self.path.replace("memory_log.jsonl", "protos_metadata_sync.jsonl")
        with open(path, "w", encoding="utf-8") as f:
            for proto in protos.values():
                f.write(json.dumps(proto, ensure_ascii=False) + "\n")