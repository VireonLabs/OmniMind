import random
from .encoders import MultiModalEncoders
import numpy as np
from .memory_log import MemoryLogger

class ExpertBase:
    def process(self, input_data, concept_id, context=None):
        raise NotImplementedError

    def health_check(self):
        return {"ok": True}

class LangExpert(ExpertBase):
    def __init__(self):
        self.encoder = MultiModalEncoders()
    def process(self, input_data, concept_id, context=None):
        try:
            if input_data is None or not isinstance(input_data, str):
                raise ValueError("Invalid text input")
            return {"output": f"Echo: {input_data}", "concept_id": concept_id, "confidence": 0.95}
        except Exception as e:
            return {"error": str(e), "concept_id": concept_id, "confidence": 0.0}

class VisionExpert(ExpertBase):
    def process(self, input_data, concept_id, context=None):
        try:
            if input_data is None or not (isinstance(input_data, bytes) or (isinstance(input_data, str) and input_data.endswith((".jpg", ".png")))):
                raise ValueError("Invalid image input")
            label = random.choice(["cat", "dog", "car", "tree"])
            return {"output": f"Vision label: {label}", "concept_id": concept_id, "confidence": 0.7}
        except Exception as e:
            return {"error": str(e), "concept_id": concept_id, "confidence": 0.0}

class PlannerExpert(ExpertBase):
    def process(self, input_data, concept_id, context=None):
        try:
            if input_data is None or not isinstance(input_data, str):
                raise ValueError("Invalid plan input")
            return {"output": f"Plan: [{input_data}] → step1 → step2", "concept_id": concept_id, "confidence": 0.8}
        except Exception as e:
            return {"error": str(e), "concept_id": concept_id, "confidence": 0.0}

class ExpertRouter:
    def __init__(self, logger=None):
        self.lang = LangExpert()
        self.vision = VisionExpert()
        self.planner = PlannerExpert()
        self.expert_map = {"text": self.lang, "image": self.vision, "plan": self.planner}
        self.logger = logger or MemoryLogger()

    def select(self, concept_id, input_data, modality="auto", trace_id=None):
        reason = ""
        if modality == "image" or (isinstance(input_data, str) and input_data.endswith((".jpg", ".png"))):
            expert = self.vision
            reason = "selected by image extension/modality"
        elif modality == "plan":
            expert = self.planner
            reason = "selected by plan modality"
        else:
            expert = self.lang
            reason = "default to language"
        self.logger.log_event(
            event_type="expert_selected",
            concept_id=concept_id,
            expert=expert.__class__.__name__,
            input_data=input_data,
            meta={"modality": modality, "reason": reason},
            trace_id=trace_id,
            service="experts",
            level="INFO"
        )
        return expert

    def list_active(self):
        return ["LangExpert", "VisionExpert", "PlannerExpert"]