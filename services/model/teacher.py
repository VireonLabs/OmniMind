import os
import json
import time

class TeacherAPI:
    def __init__(self, concept_graph, proto_memory, api_key):
        self.cg = concept_graph
        self.pm = proto_memory
        self.api_key = api_key

    def teach(self, concept_label, bundle, relations=None, headers=None, teacher_id=None):
        if not headers or headers.get("X-API-KEY") != self.api_key:
            return {"error": "Forbidden", "code": 403}
        proto_id = self.pm.assign(bundle["embedding"], bundle["modality"], meta={"taught": True, "concept_label": concept_label})
        concept_id = self.cg.link(proto_id, bundle["embedding"], labels=[concept_label])
        if relations:
            for rel in relations:
                self.cg.add_relation(concept_id, rel["to"], rel["type"], rel.get("weight", 1.0))
        entry = {
            "ts": time.time(),
            "event": "teach",
            "concept_label": concept_label,
            "proto_id": proto_id,
            "concept_id": concept_id,
            "teacher_id": teacher_id,
            "trace_id": bundle.get("trace_id")
        }
        os.makedirs("data/logs", exist_ok=True)  # جديد: ضمان وجود المسار
        log_path = "data/logs/memory_log.jsonl"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        return {"concept_id": concept_id, "proto_id": proto_id}