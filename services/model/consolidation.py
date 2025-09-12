# services/model/consolidation.py
import threading
import queue
import time
import os
import json
import shutil
import logging
from pathlib import Path
import traceback

class ConsolidationWorker(threading.Thread):
    def __init__(
        self,
        task_queue,
        artifact_dir="data/consolidation",
        logger=None,
        logs_dir="data/logs",
        exports_dir="data/exports",
        control_dir="data/control"
    ):
        super().__init__(daemon=True)
        self.q = task_queue
        self.artifact_dir = Path(artifact_dir)
        self.logs_dir = Path(logs_dir)
        self.exports_dir = Path(exports_dir)
        self.control_dir = Path(control_dir)
        self.logger = logger
        self._running = True

        # تأكد من المجلدات
        for d in [self.artifact_dir, self.logs_dir, self.exports_dir, self.control_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # fallback logger
        if self.logger is None:
            self._log = logging.getLogger("ConsolidationWorker")
            if not self._log.handlers:
                handler = logging.StreamHandler()
                handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s"))
                self._log.addHandler(handler)
            self._log.setLevel(logging.INFO)
        else:
            self._log = self.logger

    def _log_event(self, level, msg, **meta):
        try:
            if hasattr(self._log, "log_event"):
                self._log.log_event(msg, meta=meta or {}, level=level)
            else:
                getattr(self._log, level.lower(), self._log.info)(f"{msg} {meta}")
        except Exception:
            pass

    def _handle_admin_restart(self, trace_id):
        """
        لا تقوم هنا بإعادة تشغيل النظام مباشرةً — فقط تضع 'flag' أو تسجل الحدث
        ليقوم نظام التشغيل/عمليات الإدارة بالتعامل معه بطريقة آمنة.
        """
        fname = self.control_dir / f"restart_{trace_id}.flag"
        fname.write_text(str(time.time()))
        return {"result": "restart_enqueued", "control_file": str(fname)}

    def _handle_export_logs(self, trace_id):
        """
        يجمع محتويات logs_dir ويضغِطها إلى ملف zip داخل exports_dir.
        """
        base_name = self.exports_dir / f"logs_export_{trace_id}"
        # make_archive سيُنشئ base_name.zip
        shutil.make_archive(str(base_name), "zip", root_dir=str(self.logs_dir))
        return {"result": "export_done", "archive": f"{base_name}.zip"}

    def _handle_generic(self, job, trace_id):
        """
        معالجة عامة لأي job آخر — يُخزّن كـ artifact (قابلة للتوسيع لاحقًا).
        """
        # هنا يمكنك توسيع المنطق حسب الحقول في job
        return {"result": "consolidated", "job": job}

    def run(self):
        while self._running:
            try:
                job = self.q.get(timeout=1)
            except queue.Empty:
                continue

            trace_id = job.get("trace_id") or f"anon-{int(time.time()*1000)}"
            jtype = (job.get("type") or "").lower()

            result_record = {"ts": time.time(), "job": job, "trace_id": trace_id}
            try:
                self._log_event("INFO", "job_started", trace_id=trace_id, type=jtype)

                if jtype == "admin_restart":
                    result_record.update(self._handle_admin_restart(trace_id))
                elif jtype == "export_logs":
                    result_record.update(self._handle_export_logs(trace_id))
                else:
                    result_record.update(self._handle_generic(job, trace_id))

                # اكتب artifact النهائي
                filename = self.artifact_dir / f"consolidation_{trace_id}.json"
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(result_record, f, ensure_ascii=False, indent=2)

                self._log_event("INFO", "job_finished", trace_id=trace_id, artifact=str(filename))
            except Exception as e:
                tb = traceback.format_exc()
                result_record.update({"result": "error", "error": str(e), "traceback": tb})
                self._log_event("ERROR", "job_failed", trace_id=trace_id, error=str(e))
            finally:
                # دائمًا احفظ الـ artifact حتى لو فشل المعالجة
                try:
                    filename = self.artifact_dir / f"consolidation_{trace_id}.json"
                    with open(filename, "w", encoding="utf-8") as f:
                        json.dump(result_record, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass
                try:
                    self.q.task_done()
                except Exception:
                    pass

    def stop(self):
        self._running = False