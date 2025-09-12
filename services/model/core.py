"""
القلب الرئيسي للنموذج — CMSHModel
- يحمّل الأوزان عبر weights.py
- يدير كل الوحدات: encoders, proto_memory, experts, gwm, ...
- يدعم وضع التشغيل المحدود إذا لم تتوفر الأوزان (لا ينهار)
- Structured logging وحماية من الأعطال
- consolidation يعمل بآلية queue (thread + Event)
"""
import os
import threading
import time
import logging
import signal

from .weights import WeightsManager
from .encoders import MultiModalEncoders
from .proto_memory import ProtoMemory
from .concept_graph import ConceptGraph
from .experts import ExpertRouter
from .gwm import GenerativeWorldModel
from .counterfactual import CounterfactualEngine
from .intrinsic import IntrinsicMotivation
from .consolidation import DreamConsolidation
from .teacher import TeacherAPI
from .memory_log import MemoryLogger


class CMSHModel:
    def __init__(self, weights_path=None, ui_callback=None):
        self.logger = logging.getLogger("CMSHModel")
        self._weights_path = weights_path or os.environ.get(
            "MODEL_PATH", "models/base_model/weights.bin"
        )
        self.weights_state = "unknown"
        self._load_and_verify_weights()

        # MultiModalEncoders __init__ (as in encoders.py) يتطلب no args
        self.encoders = MultiModalEncoders()
        self.proto_memory = ProtoMemory()
        self.concept_graph = ConceptGraph()
        self.experts = ExpertRouter()
        self.gwm = GenerativeWorldModel()
        self.counterfactual = CounterfactualEngine(self.gwm)
        self.intrinsic = IntrinsicMotivation()
        self.consolidation = DreamConsolidation(
            self.gwm, self.proto_memory, self.concept_graph, self.experts
        )
        self.teacher = TeacherAPI(self)
        self.memory_logger = MemoryLogger()
        self.ui_callback = ui_callback

        self._status = {
            "state": "initialized",
            "weights_state": self.weights_state,
            "last_event": None,
        }

        self._consolidation_event = threading.Event()
        self._start_consolidation_worker()

        # graceful shutdown handlers
        try:
            signal.signal(signal.SIGTERM, self._on_exit)
            signal.signal(signal.SIGINT, self._on_exit)
        except Exception:
            # بعض البيئات (مثل Windows) قد لا تدعم signal بنفس الشكل — فقط سجل
            self.logger.debug("Signal handlers not fully supported in this environment.")

    def _load_and_verify_weights(self):
        wm = WeightsManager(self._weights_path)
        self.weights_state = wm.ensure_weights()
        self._status.update({"weights_state": self.weights_state})
        self.logger.info(f"Weights state: {self.weights_state}")

    def run(self, input_data, modality="auto", teacher_id=None):
        """
        نقطة الدخول للـ inference / processing من الـ API أو الـ GUI.
        تعيد dict يحتوي output, concept, provenance, confidence أو خطأ.
        """
        try:
            embedding = self.encoders.encode(input_data, modality)
            proto_id = self.proto_memory.assign(embedding, modality)
            concept_id = self.concept_graph.link(proto_id, embedding)
            expert = self.experts.select(concept_id, input_data)

            try:
                output = expert.process(input_data, concept_id)
            except Exception as e:
                self.logger.exception("Expert processing failed")
                output = {"error": f"Expert error: {str(e)}"}

            reward = self.intrinsic.compute(embedding, concept_id)

            # ✅ تصحيح استدعاء الـ logger ليتطابق مع التوقيع
            self.memory_logger.log_event(
                event_type="run",
                proto_id=proto_id,
                concept_id=concept_id,
                expert=expert.__class__.__name__ if hasattr(expert, "__class__") else str(expert),
                reward=reward,
                input_data=str(input_data)[:1024],
                meta={"teacher_id": teacher_id},
            )

            if self.ui_callback:
                # واجهة GUI قد تتوقع شكل محدد، هنا نرسل الـoutput كما هو
                try:
                    self.ui_callback(output)
                except Exception:
                    self.logger.exception("ui_callback failed")

            if reward and reward > getattr(self.intrinsic, "threshold", 0):
                # ضع حدث غير حابس لتشغيل consolidation
                self._consolidation_event.set()

            self._status["last_event"] = {"input": str(input_data)[:200], "output": output, "concept": concept_id}
            return {"output": output, "concept": concept_id, "provenance": {"proto_id": proto_id}, "confidence": reward}

        except Exception as e:
            self._status["state"] = "error"
            self.logger.exception("Run error")
            return {"error": str(e)}

    def control(self, command_dict):
        """
        تحكم آمن: يدعم مجموعة محددة من الأوامر فقط.
        """
        allowed = ["ui_update", "pause_consolidation", "resume_consolidation", "trigger_distill"]
        action = command_dict.get("action")
        if action not in allowed:
            return {"error": "action not allowed"}

        if action == "pause_consolidation":
            self._consolidation_event.clear()
        elif action == "resume_consolidation":
            self._consolidation_event.set()
        elif action == "trigger_distill":
            # يمكن إضافة تنفيذ محدد هنا
            try:
                self.consolidation.periodic_consolidation()
            except Exception:
                self.logger.exception("trigger_distill failed")

        if self.ui_callback:
            try:
                self.ui_callback(command_dict)
            except Exception:
                self.logger.exception("ui_callback failed in control")

        return {"done": True, "executed": command_dict}

    def status(self):
        """
        إرجاع حالة مختصرة حول النظام؛ psutil اختياري.
        """
        try:
            import psutil

            mem = dict(psutil.virtual_memory()._asdict())
        except Exception:
            mem = {"note": "psutil not installed or unavailable"}

        return {
            "state": self._status.get("state"),
            "weights_state": self.weights_state,
            "uptime": time.time(),
            "active_experts": getattr(self.experts, "list_active", lambda: [])(),
            "last_event": self._status.get("last_event"),
            "mem_stats": mem,
        }

    def _start_consolidation_worker(self):
        def worker():
            while True:
                self._consolidation_event.wait()  # block until set
                try:
                    self.logger.info("Consolidation cycle started")
                    self.consolidation.periodic_consolidation()
                    self._consolidation_event.clear()
                except Exception:
                    self.logger.exception("Consolidation error")

        t = threading.Thread(target=worker, daemon=True)
        t.start()

    def _on_exit(self, signum, frame):
        """
        حفظ نقطة استئناف وآمن عند الإغلاق.
        """
        self.logger.info(f"Shutdown signal received ({signum}), saving memory and logs...")
        try:
            # checkpoint proto memory + flush logs
            try:
                self.proto_memory.checkpoint()
            except Exception:
                self.logger.exception("proto_memory.checkpoint failed")
            try:
                self.memory_logger.log_event(event_type="shutdown", meta={"signal": signum})
            except Exception:
                self.logger.exception("memory_logger.log_event failed at shutdown")
            logging.shutdown()
            time.sleep(0.3)
        finally:
            # خروج نهائي
            try:
                os._exit(0)
            except SystemExit:
                raise