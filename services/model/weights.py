import os, requests, hashlib, time
from urllib.parse import urlparse
import logging

class WeightsManager:
    def __init__(self, model_path):
        self.model_path = model_path
        self.log_path = "data/logs/weights_log.json"
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        self.logger = logging.getLogger("WeightsManager")

    def ensure_weights(self):
        if os.path.exists(self.model_path):
            if self._check_sha():
                self._log("weights_reused", {"path": self.model_path})
                return "weights_loaded"
            else:
                self._log("weights_corrupt", {"path": self.model_path})
                os.remove(self.model_path)
        url = os.environ.get("WEIGHTS_URL")
        if not url:
            self._log("weights_missing", {})
            return "weights_missing"
        sha = os.environ.get("WEIGHTS_SHA256")
        for attempt in range(3):
            try:
                self._download(url)
                if sha and not self._check_sha(sha):
                    self._log("weights_sha_mismatch", {})
                    continue
                self._log("weights_downloaded", {"url_host": urlparse(url).hostname, "sha_ok": True})
                return "weights_loaded"
            except Exception as e:
                self._log("weights_download_failed", {"error": str(e), "attempt": attempt + 1})
                time.sleep(2)
        self.logger.error("weights_download_failed after 3 attempts")
        return "weights_download_failed"

    def _download(self, url):
        tmp = self.model_path + ".tmp"
        headers = {}
        token = os.environ.get("WEIGHTS_AUTH_TOKEN")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        with requests.get(url, stream=True, timeout=60, headers=headers) as r:
            r.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)
        os.replace(tmp, self.model_path)

    def _check_sha(self, sha256=None):
        sha256 = sha256 or os.environ.get("WEIGHTS_SHA256")
        if not sha256: return True
        h = hashlib.sha256()
        with open(self.model_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b''):
                h.update(chunk)
        return h.hexdigest() == sha256.lower()

    def _log(self, event, meta):
        rec = {"event": event, "ts": time.time(), "meta": meta}
        with open(self.log_path, "a", encoding="utf-8") as f:
            import json
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        # إضافة لوج فقط للنجاح/الفشل، بدون أي أسرار
        self.logger.info({"event": event, **meta})