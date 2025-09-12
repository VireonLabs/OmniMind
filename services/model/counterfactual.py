import numpy as np

class CounterfactualEngine:
    def __init__(self):
        pass

    def simulate(self, seqs, extrinsic_rewards=None, intrinsic_rewards=None, topk=3):
        # seqs: List[np.ndarray] each (T, latent_dim)
        scored = []
        for i, seq in enumerate(seqs):
            ext = extrinsic_rewards[i] if extrinsic_rewards is not None else np.random.rand()
            intr = intrinsic_rewards[i] if intrinsic_rewards is not None else np.random.rand()
            score = ext + intr
            scored.append({"score": float(score), "extrinsic": float(ext), "intrinsic": float(intr), "seq_idx": i, "provenance": {"source": "simulate"}})
        top = sorted(scored, key=lambda d: -d["score"])[:topk]
        return top