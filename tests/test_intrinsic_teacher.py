# tests/test_intrinsic_teacher_merged.py

from services.model.intrinsic import IntrinsicMotivation
from services.model.teacher import TeacherAPI
from services.model.concept_graph import ConceptGraph
from services.model.proto_memory import ProtoMemory
from services.model.memory_log import MemoryLogger
import numpy as np
import tempfile

def test_intrinsic_and_teacher(tmp_path):
    # إنشاء نموذج IntrinsicMotivation
    m = IntrinsicMotivation()
    arr = np.random.rand(384).astype(np.float32)
    total, details = m.compute(arr, "c_test_1")
    assert "novelty" in details and "prediction_error" in details

    # إنشاء ConceptGraph و ProtoMemory و MemoryLogger باستخدام مسارات مؤقتة
    cg = ConceptGraph(path=str(tmp_path / "cg.jsonl"))
    pm = ProtoMemory(index_file=str(tmp_path / "pm.bin"), meta_file=str(tmp_path / "pm.jsonl"))
    logger = MemoryLogger(path=str(tmp_path / "memory_log.jsonl"))

    # إنشاء TeacherAPI مع Logger مؤقت
    teacher = TeacherAPI(cg, pm, api_key="secret")

    # إعداد بيانات التدريس
    bundle = {"embedding": arr.tolist(), "modality": "text", "trace_id": "tid1"}
    headers = {"X-API-KEY": "secret"}

    # تنفيذ teach
    result = teacher.teach(
        "حصان",
        bundle,
        relations=[],
        headers=headers,
        teacher_id="t01"
    )

    # تحقق من أن النتائج تحتوي على concept_id و proto_id
    assert "concept_id" in result and "proto_id" in result

    # تحقق من أن الـ log يحتوي على حدث teach
    with open(str(tmp_path / "memory_log.jsonl"), "r", encoding="utf-8") as f:
        logs = f.readlines()
        assert any("teach" in l for l in logs)