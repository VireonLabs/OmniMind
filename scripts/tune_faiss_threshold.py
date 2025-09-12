import numpy as np
from services.model.encoders import MultiModalEncoders
from services.model.faiss_store import FaissStore, normalize
import random
import os

def main(sample_size=1000):
    enc = MultiModalEncoders()
    index_file = "data/tune_faiss.bin"
    faiss = FaissStore(dim=enc.dim, index_file=index_file)

    vecs = [enc.encode_text(f"sample {i}") for i in range(sample_size)]
    for i, v in enumerate(vecs):
        faiss.add(v, f"p_{i:05d}")

    dists = []
    for v in vecs:
        ids, sims = faiss.search(v, k=5)
        for sim in sims[1:]:
            dists.append(sim)

    dists = np.array(dists)
    print("mean similarity:", np.mean(dists))
    print("95% percentile:", np.percentile(dists, 95))
    print("99% percentile:", np.percentile(dists, 99))
    print("Suggested threshold:", np.percentile(dists, 99) * 0.98)

    # cleanup: حذف الملف المؤقت
    try:
        if os.path.exists(index_file):
            os.remove(index_file)
        if os.path.exists(index_file + ".ids"):
            os.remove(index_file + ".ids")
    except Exception as e:
        print("Warning: could not delete temporary files:", e)

if __name__ == "__main__":
    main()