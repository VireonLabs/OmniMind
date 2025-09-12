import requests
import os
import tempfile

BASE = os.getenv("API_BASE", "http://localhost:8500")
API_KEY = os.getenv("API_KEY", "changeme")

# حجم الملف الكبير بالميغابايت، يمكن تعديله عبر متغير بيئة
LARGE_FILE_SIZE_MB = int(os.getenv("UPLOAD_LARGE_SIZE_MB", "50"))

def test_health():
    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"

def test_encode_assign():
    emb = requests.post(
        f"{BASE}/encode",
        json={"input": "hello", "modality": "text"},
        headers={"X-API-KEY": API_KEY}
    ).json()["embedding"]
    assert isinstance(emb, list)

    pid = requests.post(
        f"{BASE}/assign",
        json={"embedding": emb, "modality": "text"},
        headers={"X-API-KEY": API_KEY}
    ).json()["proto_id"]
    assert pid.startswith("p_")

def test_upload_small():
    content = b"hello world"  # يمكن تغيير المحتوى لاختبارات أخرى
    with tempfile.NamedTemporaryFile("w+b", delete=False) as tmp_file:
        try:
            tmp_file.write(content)
            tmp_file.flush()
            tmp_file.seek(0)

            r = requests.post(
                f"{BASE}/upload",
                files={"file": tmp_file},
                headers={"X-API-KEY": API_KEY}
            )
            assert r.status_code == 200
            # تحقق ديناميكي من حجم الملف
            assert r.json()["size"] == len(content)
        finally:
            tmp_file.close()
            os.unlink(tmp_file.name)

def test_upload_empty():
    content = b""
    with tempfile.NamedTemporaryFile("w+b", delete=False) as tmp_file:
        try:
            tmp_file.write(content)
            tmp_file.flush()
            tmp_file.seek(0)

            r = requests.post(
                f"{BASE}/upload",
                files={"file": tmp_file},
                headers={"X-API-KEY": API_KEY}
            )
            assert r.status_code == 200
            assert r.json()["size"] == len(content)
        finally:
            tmp_file.close()
            os.unlink(tmp_file.name)

def test_upload_large():
    # تحويل حجم الملف من ميغابايت إلى بايت
    large_size = LARGE_FILE_SIZE_MB * 1024 * 1024
    content = b"a" * large_size

    with tempfile.NamedTemporaryFile("w+b", delete=False) as tmp_file:
        try:
            tmp_file.write(content)
            tmp_file.flush()
            tmp_file.seek(0)

            r = requests.post(
                f"{BASE}/upload",
                files={"file": tmp_file},
                headers={"X-API-KEY": API_KEY}
            )
            assert r.status_code == 200
            assert r.json()["size"] == len(content)
        finally:
            tmp_file.close()
            os.unlink(tmp_file.name)

def test_auth_fail():
    r = requests.post(
        f"{BASE}/encode",
        json={"input": "hello", "modality": "text"},
        headers={"X-API-KEY": "wrong"}
    )
    assert r.status_code == 403