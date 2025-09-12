import requests
import os

BASE = os.getenv("API_BASE", "http://localhost:8500")

def test_health_endpoint():
    """تأكد من أن endpoint /health يعمل بشكل صحيح"""
    r = requests.get(f"{BASE}/health")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    
    data = r.json()
    assert data.get("status") == "ok", f"Health status not OK: {data.get('status')}"
    
    # تحقق من الحقول المهمة الأخرى
    assert "weights_state" in data, "weights_state missing in response"
    assert "faiss_ok" in data, "faiss_ok missing in response"
    assert isinstance(data.get("weights_state"), str), "weights_state should be string"
    assert isinstance(data.get("faiss_ok"), bool), "faiss_ok should be boolean"