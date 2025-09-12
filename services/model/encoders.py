import numpy as np
from .config import EMBED_DIM
from typing import Union

class MultiModalEncoders:
    def __init__(self):
        self.dim = EMBED_DIM

    def encode(self, input_data: Union[str, bytes], modality="auto"):
        if modality == "text" or (modality == "auto" and isinstance(input_data, str)):
            return self.encode_text(input_data)
        elif modality == "image" or (modality == "auto" and self._is_image(input_data)):
            return self.encode_image(input_data)
        elif modality == "audio" or (modality == "auto" and self._is_audio(input_data)):
            return self.encode_audio(input_data)
        else:
            raise ValueError(f"Unsupported modality or input type: {modality}")

    def encode_text(self, text: str):
        np.random.seed(hash(text) % 2**32)
        return np.random.rand(self.dim).astype(np.float32)

    def encode_image(self, img_bytes: bytes):
        # Stub: hash over bytes to give deterministic vector
        h = hash(img_bytes)
        np.random.seed(h % 2**32)
        return np.random.rand(self.dim).astype(np.float32)

    def encode_audio(self, audio_bytes: bytes):
        h = hash(audio_bytes)
        np.random.seed(h % 2**32)
        return np.random.rand(self.dim).astype(np.float32)

    def _is_image(self, inp):
        if isinstance(inp, bytes):
            # Stub: check for common image header
            return inp[:4] in [b"\xff\xd8\xff\xe0", b"\x89PNG"]
        if isinstance(inp, str):
            return inp.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp'))
        return False

    def _is_audio(self, inp):
        if isinstance(inp, bytes):
            return inp[:4] in [b"RIFF", b"OggS"]
        if isinstance(inp, str):
            return inp.lower().endswith(('.wav', '.mp3', '.ogg'))
        return False

    def encode_batch(self, list_inputs, modality="auto"):
        return [self.encode(i, modality) for i in list_inputs]