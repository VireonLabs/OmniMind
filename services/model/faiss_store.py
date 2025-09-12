import faiss
import numpy as np
import os
import pickle
import threading
import logging

def normalize(vec):
    v = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(v)
    return (v / norm) if norm > 0 else v

class FaissStore:
    def __init__(self, dim, index_file):
        self.dim = dim
        self.index_file = index_file
        self.lock = threading.Lock()
        self.index = faiss.IndexIDMap(faiss.IndexFlatIP(dim))
        self.ids_map = {}  # int64 -> external proto_id
        self._next_int_id = 1
        self._ids_file = self.index_file + ".ids"
        self._load()

    def _get_next_id(self):
        val = self._next_int_id
        self._next_int_id += 1
        return val

    def add(self, vector, proto_id):
        with self.lock:
            v = normalize(vector).reshape(1, -1)
            int_id = self._get_next_id()
            self.index.add_with_ids(v, np.array([int_id], dtype=np.int64))
            self.ids_map[int_id] = proto_id
            self._save_ids()

    def search(self, vector, k=5):
        with self.lock:
            v = normalize(vector).reshape(1, -1)
            D, I = self.index.search(v, k)
            out_ids = []
            for int_id in I[0]:
                if int_id == -1:
                    continue
                proto_id = self.ids_map.get(int_id)
                out_ids.append(proto_id)
            return out_ids, D[0].tolist()

    def remove(self, proto_id):
        with self.lock:
            int_id = None
            for k, v in self.ids_map.items():
                if v == proto_id:
                    int_id = k
                    break
            if int_id is not None:
                faiss_id = np.array([int_id], dtype=np.int64)
                self.index.remove_ids(faiss_id)
                del self.ids_map[int_id]
                self._save_ids()

    def save(self):
        with self.lock:
            faiss.write_index(self.index, self.index_file)
            self._save_ids()

    def _save_ids(self):
        with open(self._ids_file, "wb") as f:
            pickle.dump({"ids_map": self.ids_map, "next_int_id": self._next_int_id}, f)

    def _load(self):
        logger = logging.getLogger("FaissStore")
        if os.path.exists(self.index_file):
            try:
                idx = faiss.read_index(self.index_file)
                if not isinstance(idx, faiss.IndexIDMap):
                    idx = faiss.IndexIDMap(idx)
                self.index = idx
            except Exception as e:
                logger.error(f"Could not read FAISS index: {e}")
        if os.path.exists(self._ids_file):
            try:
                with open(self._ids_file, "rb") as f:
                    d = pickle.load(f)
                    self.ids_map = d.get("ids_map", {})
                    self._next_int_id = d.get("next_int_id", 1)
            except Exception as e:
                logger.warning(f"Could not load ids_map: {e}")
        else:
            logger.warning("No .ids file found; ids_map is empty, index may be unsynchronized.")