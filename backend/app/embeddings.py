from __future__ import annotations

import threading

import numpy as np


class BaseEmbedder:
    dimension: int = 384

    def embed(self, texts: list[str]) -> list[bytes]:
        raise NotImplementedError


class SentenceTransformerEmbedder(BaseEmbedder):
    MODEL_NAME = "all-MiniLM-L6-v2"

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()

    def _load(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import SentenceTransformer

                    self._model = SentenceTransformer(self.MODEL_NAME)
        return self._model

    def embed(self, texts: list[str]) -> list[bytes]:
        model = self._load()
        vectors = model.encode(texts, normalize_embeddings=True)
        return [np.asarray(v, dtype=np.float32).tobytes() for v in vectors]


class DeterministicEmbedder(BaseEmbedder):
    """Hash-based vectors for tests: similar texts share tokens -> high cosine."""

    def __init__(self, dimension: int = 64) -> None:
        self.dimension = dimension

    def embed(self, texts: list[str]) -> list[bytes]:
        out = []
        for text in texts:
            vec = np.zeros(self.dimension, dtype=np.float32)
            for token in text.lower().split():
                slot = hash(token) % self.dimension
                vec[slot] += 1.0
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec /= norm
            out.append(vec.tobytes())
        return out


_embedder_lock = threading.Lock()
_embedder: BaseEmbedder | None = None


def get_embedder() -> BaseEmbedder:
    global _embedder
    with _embedder_lock:
        if _embedder is None:
            from app.config import GROQ_API_KEY  # noqa: F401

            import os

            if os.getenv("TASKER_EMBEDDER", "local") == "mock":
                _embedder = DeterministicEmbedder()
            else:
                _embedder = SentenceTransformerEmbedder()
        return _embedder


def set_embedder(embedder: BaseEmbedder | None) -> None:
    global _embedder
    with _embedder_lock:
        _embedder = embedder
