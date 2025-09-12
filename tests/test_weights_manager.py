import os
from services.model.weights import WeightsManager

def test_weights_url_missing(tmp_path):
    file = tmp_path / "w.bin"
    os.environ.pop("WEIGHTS_URL", None)
    wm = WeightsManager(str(file))
    state = wm.ensure_weights()
    assert state == "weights_missing"

def test_sha_mismatch(tmp_path, monkeypatch):
    file = tmp_path / "w2.bin"
    with open(file, "wb") as f:
        f.write(b"abc")
    os.environ["WEIGHTS_URL"] = "http://example.com"
    os.environ["WEIGHTS_SHA256"] = "deadbeef"
    def fake_download(url): pass
    wm = WeightsManager(str(file))
    wm._download = fake_download
    state = wm.ensure_weights()
    assert state in ("weights_missing", "weights_sha_mismatch", "weights_download_failed")