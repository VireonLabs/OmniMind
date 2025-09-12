import numpy as np
import time
from collections import deque

class IntrinsicMotivation:
    def __init__(self, history_len=5):
        # لكل concept: history deque of embeddings + prediction_errors
        self.proto_history = {}
        self.pred_error_history = {}
        self.history_len = history_len

    def compute(self, embedding, concept_id):
        # history: deque of embeddings
        if concept_id not in self.proto_history:
            self.proto_history[concept_id] = deque(maxlen=self.history_len)
        if concept_id not in self.pred_error_history:
            self.pred_error_history[concept_id] = deque([0.0], maxlen=2)

        h = self.proto_history[concept_id]
        h.append(embedding.copy())
        if len(h) > 1:
            mean_prev = np.mean(list(h)[:-1], axis=0)
            prediction_error = float(np.mean(np.abs(embedding - mean_prev)))
        else:
            prediction_error = 0.0

        prev_pred_error = self.pred_error_history[concept_id][-1]
        learning_progress = float(abs(prediction_error - prev_pred_error))
        self.pred_error_history[concept_id].append(prediction_error)

        # Novelty: distance to last embedding
        if len(h) > 1:
            novelty = float(np.linalg.norm(embedding - h[-2]))
        else:
            novelty = 0.0

        total = novelty + prediction_error + learning_progress
        details = {
            "novelty": novelty,
            "prediction_error": prediction_error,
            "learning_progress": learning_progress,
            "total": total,
        }
        return total, details