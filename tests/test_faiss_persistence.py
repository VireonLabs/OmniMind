from services.model.proto_memory import ProtoMemory
import numpy as np
import os

def test_persistence(tmp_path):
    emb1 = np.ones(1536, dtype=np.float32)
    emb2 = np.random.rand(1536).astype(np.float32)  # إضافة embedding مختلف لاختبار التعدد

    # إنشاء الذاكرة وحفظ أول embedding
    pm = ProtoMemory(index_file=str(tmp_path/"faiss.bin"), meta_file=str(tmp_path/"protos.jsonl"))
    p1 = pm.assign(emb1, "text")
    p2 = pm.assign(emb2, "text")
    pm.save()

    # إعادة التحميل في كائن جديد
    pm2 = ProtoMemory(index_file=str(tmp_path/"faiss.bin"), meta_file=str(tmp_path/"protos.jsonl"))
    pm2.load()

    # التحقق من أن العناصر محفوظة
    hits1 = pm2.search(emb1)
    hits2 = pm2.search(emb2)

    assert p1 in [h[0] for h in hits1], f"Embedding 1 not found in loaded FAISS memory"
    assert p2 in [h[0] for h in hits2], f"Embedding 2 not found in loaded FAISS memory"

    # تحقق من أن meta_file يحتوي على بيانات
    with open(tmp_path/"protos.jsonl") as f:
        lines = f.readlines()
        assert len(lines) >= 2, "Meta file should have at least 2 entries"