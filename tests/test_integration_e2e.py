import os, requests
from services.model.proto_memory import ProtoMemory
import numpy as np

BASE = os.getenv("API_BASE", "http://localhost:8500")
API_KEY = os.getenv("API_KEY", "changeme")
UPLOAD_PATH = "tests/data/test.png"

def ensure_file(path):
    if not os.path.exists(path):
        print(f"{path} not found, creating dummy file...")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(np.random.randint(0,255,(10,10,3),dtype=np.uint8).tobytes())

def test_upload_and_fix():
    ensure_file(UPLOAD_PATH)
    with open(UPLOAD_PATH, "rb") as f:
        r = requests.post(f"{BASE}/upload", files={"file": f}, headers={"X-API-KEY": API_KEY})
        if r.status_code != 200:
            print("Upload failed, trying to create uploads dir...")
            os.makedirs("data/uploads", exist_ok=True)
            r = requests.post(f"{BASE}/upload", files={"file": f}, headers={"X-API-KEY": API_KEY})
        assert r.status_code == 200
    print("Upload OK")

    r = requests.post(f"{BASE}/encode", json={"input":"hello","modality":"text"}, headers={"X-API-KEY": API_KEY})
    if r.status_code != 200:
        print("Encode failed, rebuilding ProtoMemory...")
        pm = ProtoMemory("data/faiss.bin", "data/protos.jsonl")
        pm.save()
        r = requests.post(f"{BASE}/encode", json={"input":"hello","modality":"text"}, headers={"X-API-KEY": API_KEY})
    assert r.status_code == 200
    print("Encode OK")