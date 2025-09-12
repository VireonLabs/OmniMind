import networkx as nx
import os
import json
import threading
import time
import tempfile
import shutil

class ConceptGraph:
    def __init__(self, path="data/concept_graph.jsonl"):
        self.lock = threading.Lock()
        self.path = path
        self.G = nx.Graph()
        self._load()

    def _load(self):
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        node = json.loads(line)
                        self.G.add_node(
                            node["concept_id"],
                            **{k: v for k, v in node.items() if k != "concept_id"}
                        )
                    except Exception:
                        continue

    def link(self, proto_id, embedding, labels=None, confidence=0.5, provenance=None):
        with self.lock:
            for node, data in self.G.nodes(data=True):
                if proto_id in data.get("proto_refs", []):
                    data["last_updated"] = time.time()
                    return node
            concept_id = f"c_{self.G.number_of_nodes():05d}"
            self.G.add_node(
                concept_id,
                proto_refs=[proto_id],
                labels=labels or [],
                confidence=confidence,
                provenance=provenance or {},
                last_updated=time.time(),
            )
            self._dump_all()  # تحديث كامل عند كل إضافة
            return concept_id

    def add_relation(self, a, b, rel_type, weight=1.0):
        with self.lock:
            self.G.add_edge(a, b, rel_type=rel_type, weight=weight)
            self._dump_all()

    def query(self, node, depth=1, types=None):
        with self.lock:
            neighbors = nx.single_source_shortest_path_length(self.G, node, cutoff=depth)
            result = []
            for n in neighbors:
                data = self.G.nodes[n]
                if not types or any(t in data.get("labels", []) for t in types):
                    result.append({"concept_id": n, **data})
            return result

    def _dump_all(self):
        with self.lock:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                for node in self.G.nodes():
                    data = self.G.nodes[node]
                    obj = {"concept_id": node, **data}
                    f.write(json.dumps(obj, ensure_ascii=False) + "\n")
            os.replace(tmp, self.path)

    def checkpoint(self):
        # explicit call
        self._dump_all()