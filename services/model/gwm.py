import numpy as np
import time

class GenerativeWorldModel:
    def __init__(self, latent_dim=32, seed=None):
        self.latent_dim = latent_dim
        self.seed = seed or int(time.time())

    def generate(self, concept_id, T=16, precision="float32"):
        np.random.seed(self.seed + hash(concept_id) % 2**32)
        dtype = np.float16 if precision == "float16" else np.float32
        latents = np.random.randn(T, self.latent_dim).astype(dtype)
        return latents

    def generate_dreams(self, n=5, T=16, precision="float32"):
        dreams = []
        for i in range(n):
            dreams.append(self.generate(concept_id=f"dream_{i}", T=T, precision=precision))
        return dreams