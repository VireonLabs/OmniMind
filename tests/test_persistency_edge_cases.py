import tempfile, os, shutil
from services.model.proto_memory import ProtoMemory
from services.model.faiss_store import FaissStore

def test_missing_ids_file():
    with tempfile.TemporaryDirectory() as d:
        index_file = os.path.join(d, "faiss.bin")
        meta_file = os.path.join(d, "protos.jsonl")
        m = ProtoMemory(index_file=index_file, meta_file=meta_file)
        pid1 = m.assign([0.1]*384, modality="text")
        m.checkpoint()
        os.remove(index_file + ".ids")
        # إعادة تحميل مع تحذير متوقع
        m2 = ProtoMemory(index_file=index_file, meta_file=meta_file)
        pid2 = m2.assign([0.2]*384, modality="text")
        m2.checkpoint()
        assert pid1 in m2.protos

def test_add_remove_reload():
    with tempfile.TemporaryDirectory() as d:
        index_file = os.path.join(d, "faiss.bin")
        meta_file = os.path.join(d, "protos.jsonl")
        m = ProtoMemory(index_file=index_file, meta_file=meta_file)
        pid1 = m.assign([0.1]*384, modality="text")
        pid2 = m.assign([0.2]*384, modality="text")
        m.checkpoint()
        m.faiss.remove(pid1)
        m.checkpoint()
        m2 = ProtoMemory(index_file=index_file, meta_file=meta_file)
        assert pid2 in m2.protos
        assert pid1 not in m2.protos