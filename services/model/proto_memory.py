import threading, time, json, os
from .faiss_store import FaissStore, normalize
from .config import EMBED_DIM, FAISS_INDEX_FILE, PROTO_META_FILE, FAISS_THRESHOLD
import numpy as np
import tempfile

class ProtoMemory:
    def __init__(self, dim=EMBED_DIM, index_file=FAISS_INDEX_FILE, meta_file=PROTO_META_FILE, threshold=FAISS_THRESHOLD):
        self.lock = threading.Lock()
        self.faiss = FaissStore(dim=dim, index_file=index_file)
        self.meta_file = meta_file
        self.threshold = threshold
        self._load_metadata()

    def _load_metadata(self):
        self.protos = {}
        if os.path.exists(self.meta_file):
            with open(self.meta_file, "r", encoding="utf-8") as f:
                for line in f:
                    obj = json.loads(line)
                    self.protos[obj["proto_id"]] = obj

    def assign(self, embedding, modality, meta=None):
        embedding = normalize(embedding)
        with self.lock:
            proto_ids, sims = self.faiss.search(embedding, k=1)
            proto_id = None
            if proto_ids and sims and sims[0] is not None and sims[0] >= self.threshold and proto_ids[0]:
                proto_id = proto_ids[0]
                self.protos[proto_id]["count"] += 1
                self.protos[proto_id]["last_updated"] = time.time()
            else:
                proto_id = f"p_{len(self.protos):05d}"
                self.faiss.add(embedding, proto_id)
                self.protos[proto_id] = {
                    "proto_id": proto_id,
                    "centroid": embedding.tolist(),
                    "modality": modality,
                    "count": 1,
                    "meta": meta,
                    "last_updated": time.time(),
                }
            return proto_id

    def search(self, embedding, k=5):
        embedding = normalize(embedding)
        with self.lock:
            return self.faiss.search(embedding, k=k)

    def _dump_all(self):
        # Write all proto metadata atomically
        tmp = self.meta_file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            for proto in self.protos.values():
                f.write(json.dumps(proto, ensure_ascii=False) + "\n")
        os.replace(tmp, self.meta_file)

    def checkpoint(self):
        with self.lock:
            self.faiss.save()
            self._dump_all()