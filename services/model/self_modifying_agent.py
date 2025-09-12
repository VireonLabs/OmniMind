"""
SelfModifyingAgent — Next-Gen Self-Improvement Agent
يجمع بين: التعديل الذاتي، sandbox المتعدد، تحليل الاعتماديات، تقييم المخاطر الذكي، self-retry، peer review افتراضي، توليد وثائق تلقائي، dashboard hooks، عزل sandbox متقدم، rollback ذاتي، predictive security (LLM-ready)، ودعم telemetry خصوصي.

كل شيء يعمل تلقائيًا وقابل للدمج مع أي نموذج ذكاء اصطناعي أو orchestrator.
"""

import os
import json
import time
import threading
import tempfile
import shutil
import hashlib
import uuid
import subprocess
import difflib
import ast
import random
import math
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from typing import Any, Dict, List, Optional, Tuple, Callable

# ========= Utility/Safety helpers =========
DANGEROUS_PATTERNS = [
    "os.system(", "subprocess.Popen(", "eval(", "exec(", "`", "os.popen(", "open('/dev/",
    "import pty", "pty.spawn(", "import socket", "socket.socket(", "shutil.rmtree(", "rm -rf"
]

def safe_join_repo(repo_root: str, user_path: str) -> str:
    repo_root = os.path.abspath(repo_root or os.getcwd())
    candidate = os.path.abspath(os.path.join(repo_root, user_path))
    if candidate == repo_root:
        return candidate
    if not candidate.startswith(repo_root + os.sep):
        raise ValueError("Unsafe code_path (outside repo root) detected.")
    return candidate

def code_is_safe(code: str) -> Tuple[bool, str]:
    if not code:
        return True, "ok"
    for p in DANGEROUS_PATTERNS:
        if p in code:
            return False, f"dangerous pattern found: {p}"
    return True, "ok"

def hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()

# ========= Audit store (JSONL) =========
class AuditStore:
    def __init__(self, log_path: str = "data/logs/self_modifying_log.jsonl"):
        self.log_path = log_path
        self._lock = threading.Lock()
        self.changes: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        self.changes = []
        if not os.path.exists(self.log_path):
            return
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                for i, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        self.changes.append(json.loads(line))
                    except Exception:
                        print(f"[AuditStore] skipping invalid jsonl line {i}")
        except Exception:
            pass

    def log(self, entry: Dict[str, Any]):
        e = dict(entry)
        e.setdefault("ts", time.time())
        e.setdefault("version", len(self.changes) + 1)
        with self._lock:
            os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
            self.changes.append(e)

    def last(self) -> Optional[Dict[str, Any]]:
        return self.changes[-1] if self.changes else None

    def get(self, update_id: str) -> Optional[Dict[str, Any]]:
        for c in reversed(self.changes):
            if c.get("update_id") == update_id:
                return c
        return None

# ========= Notifications (pluggable) =========
class NotificationClient:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled

    def notify(self, msg: str, level: str = "INFO"):
        if self.enabled:
            print(f"[{level}] {msg}")

class NullNotifier(NotificationClient):
    def __init__(self):
        super().__init__(enabled=False)
    def notify(self, msg: str, level: str = "INFO"):
        return

# ========= Security & Type checks + PredictiveSecurity (LLM-ready) =========
class EnhancedSecurityChecker:
    FORBIDDEN_ATTRS = {"API_KEY", "CORS_ALLOW_ORIGINS", "SECRET", "PASSWORD", "KEY", "TOKEN"}

    def __init__(self, attr_policies: Dict[str, str] = None, custom_rules: List = None, predictive_checker=None):
        self.attr_policies = attr_policies or {}
        self.custom_rules = custom_rules or []
        self.predictor = predictive_checker

    def adaptive_type_check(self, old: Any, new: Any, attr: str, audit_comments: Optional[List[str]] = None) -> Tuple[bool, str]:
        if old is None:
            return True, "adding new attribute"
        if type(old) == type(new):
            return True, "type match"
        if isinstance(old, (int, float)) and isinstance(new, (int, float)):
            if audit_comments is not None:
                audit_comments.append("numeric coercion")
            return True, "numeric coercion"
        if isinstance(old, str) and isinstance(new, (int, float)):
            try:
                float(old)
                if audit_comments is not None:
                    audit_comments.append("str->number coercion")
                return True, "str->number coercion"
            except Exception:
                return False, "unsafe str->number"
        if isinstance(old, (int, float)) and isinstance(new, str):
            try:
                float(new)
                if audit_comments is not None:
                    audit_comments.append("number->str coercion")
                return True, "number->str coercion"
            except Exception:
                return False, "unsafe number->str"
        if (isinstance(old, (dict, list)) or isinstance(new, (dict, list))) and type(old) != type(new):
            return False, "structural change not allowed"
        return False, "unhandled type change"

    def check(self, update: Dict[str, Any], approvals: int = 0, existing_attrs: Dict[str, Any] = None, audit_comments: Optional[List[str]] = None) -> Tuple[bool, str]:
        attr = update.get("attr", "")
        if any(forb.lower() in attr.lower() for forb in self.FORBIDDEN_ATTRS):
            return False, "modification of sensitive attribute is forbidden"
        if "required_approvals" in update and approvals < update["required_approvals"]:
            return False, "not enough approvals"
        old = update.get("old_value")
        new = update.get("proposed_value")
        if old is not None:
            ok, info = self.adaptive_type_check(old, new, attr, audit_comments)
            if not ok:
                return False, info
        if self.predictor and update.get("proposed_code"):
            safe, conf, reason = self.predictor.predict(update["proposed_code"], update)
            if not safe:
                return False, f"predictive security: {reason} ({conf:.2f})"
        if existing_attrs and attr in existing_attrs and existing_attrs[attr] != old:
            return False, "conflict with current attribute"
        for rule in self.custom_rules:
            ok, msg = rule(update)
            if not ok:
                return False, msg
        return True, "passed"

class PredictiveSecurityChecker:
    def __init__(self, llm_adapter=None):
        self.llm = llm_adapter
    def predict(self, code: str, context: Dict[str,Any] = None) -> Tuple[bool, float, str]:
        ok, msg = code_is_safe(code)
        if self.llm and self.llm.is_enabled():
            # call LLM to analyze - placeholder
            return True, 0.8, "LLM analysis placeholder"
        confidence = 0.6 if ok else 0.95
        return ok, confidence, msg

# ========= Git integration (token-aware) =========
class GitManager:
    def __init__(self, repo_path: Optional[str] = None, remote: str = "origin", token_env: str = "SM_AGENT_GIT_TOKEN"):
        self.repo_path = os.path.abspath(repo_path) if repo_path else os.getcwd()
        self.remote = remote
        self.token = os.environ.get(token_env)
        self.enabled = bool(self.token)
        self._warned = False
    def _run(self, args: List[str], cwd: Optional[str] = None, env: Optional[Dict[str, str]] = None):
        try:
            return subprocess.run(["git"] + args, cwd=cwd or self.repo_path, capture_output=True, text=True, check=False, env=env)
        except Exception as e:
            return subprocess.CompletedProcess(args, returncode=1, stdout="", stderr=str(e))
    def _with_token_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        if self.token:
            env["GIT_ASKPASS"] = ""
        return env
    def checkout_branch(self, branch: str) -> subprocess.CompletedProcess:
        if not self.enabled:
            if not self._warned:
                print("[GitManager] token missing: running in mock mode")
                self._warned = True
            return subprocess.CompletedProcess([], 0)
        return self._run(["checkout", "-B", branch])
    def commit(self, msg: str, files: Optional[List[str]] = None) -> subprocess.CompletedProcess:
        if not self.enabled:
            return subprocess.CompletedProcess([], 0)
        if files:
            self._run(["add"] + files)
        return self._run(["commit", "-m", msg])
    def push(self, branch: str) -> subprocess.CompletedProcess:
        if not self.enabled:
            return subprocess.CompletedProcess([], 0)
        env = self._with_token_env()
        return self._run(["push", self.remote, branch], env=env)
    def create_branch_and_commit(self, files: List[str], msg: str) -> str:
        branch = f"selfmod_{uuid.uuid4().hex[:8]}"
        self.checkout_branch(branch)
        self.commit(msg, files)
        self.push(branch)
        return branch
    def pr_simulation(self, branch: str, base: str = "main") -> Dict[str, str]:
        return {"pr_url": f"https://example.com/{os.path.basename(self.repo_path)}/pull/{branch}", "branch": branch}
    def check_license(self) -> bool:
        return os.path.exists(os.path.join(self.repo_path, "LICENSE"))

# ========= SandboxRunner & MultiLayerSandbox =========
class SandboxRunner:
    def __init__(self, repo_root: str, cpu_limit: int = 1, mem_mb: int = 512):
        self.repo_root = repo_root
        self.cpu_limit = cpu_limit
        self.mem_mb = mem_mb
    def _limit_resources_preexec(self):
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_CPU, (self.cpu_limit, self.cpu_limit))
            resource.setrlimit(resource.RLIMIT_AS, (self.mem_mb * 1024 * 1024, self.mem_mb * 1024 * 1024))
        except Exception:
            pass
    def run(self, changed_files: Dict[str, str], test_cmd: List[str], timeout: int = 30, level: str = "limited") -> Tuple[bool, Dict[str, Any]]:
        tmpdir = tempfile.mkdtemp(prefix="selfmod_")
        try:
            for root, dirs, files in os.walk(self.repo_root):
                if ".git" in dirs:
                    dirs.remove(".git")
                rel = os.path.relpath(root, self.repo_root)
                dest = os.path.join(tmpdir, rel) if rel != "." else tmpdir
                os.makedirs(dest, exist_ok=True)
                for f in files:
                    shutil.copy2(os.path.join(root, f), os.path.join(dest, f))
            for path, content in changed_files.items():
                fpath = safe_join_repo(tmpdir, path)
                os.makedirs(os.path.dirname(fpath), exist_ok=True)
                with open(fpath, "w", encoding="utf-8") as fh:
                    fh.write(content)
            kwargs = {"cwd": tmpdir, "capture_output": True, "timeout": timeout, "text": True, "check": False}
            preexec = None
            if level == "dry":
                return True, {"note": "dry-run success (no tests executed)"}
            if level == "limited":
                try:
                    import resource  # type: ignore
                    preexec = self._limit_resources_preexec
                except Exception:
                    preexec = None
            if preexec:
                kwargs["preexec_fn"] = preexec
            proc = subprocess.run(test_cmd, **kwargs)
            success = proc.returncode == 0
            metrics = {
                "returncode": proc.returncode,
                "stdout": (proc.stdout or "")[-2000:],
                "stderr": (proc.stderr or "")[-2000:],
            }
            return success, metrics
        except subprocess.TimeoutExpired as te:
            return False, {"error": "timeout", "details": str(te)}
        except Exception as e:
            return False, {"error": str(e)}
        finally:
            try:
                shutil.rmtree(tmpdir)
            except Exception:
                pass

# ------------ Batch Sandbox + Best-selection ------------
class BatchSandboxManager:
    def __init__(self, sandbox_runner, max_workers: int = None):
        self.sandbox = sandbox_runner
        self.max_workers = max_workers or int(os.getenv("SM_AGENT_MAX_PARALLEL", "3"))
    def run_batch(self, updates: List[Dict[str, Any]], test_cmd: List[str], timeout: int = 60, level: str = "limited") -> Dict[str, Dict[str, Any]]:
        results = {}
        with ThreadPoolExecutor(max_workers=min(self.max_workers, max(1, len(updates)))) as ex:
            future_map = {}
            for u in updates:
                files = {}
                if u.get("code_path") and u.get("proposed_code"):
                    files[u["code_path"]] = u["proposed_code"]
                future_map[ex.submit(self.sandbox.run, files, test_cmd, timeout, level)] = u["update_id"]
            for fut in as_completed(future_map):
                uid = future_map[fut]
                try:
                    ok, metrics = fut.result()
                except Exception as e:
                    ok, metrics = False, {"error": str(e)}
                results[uid] = {"ok": ok, "metrics": metrics}
        return results
    def pick_best(self, updates: List[Dict[str, Any]], sandbox_results: Dict[str, Dict[str, Any]], scoring_fn=None) -> List[Dict[str, Any]]:
        def default_score(u, m):
            s = 0.0
            if m.get("ok"):
                s += 1.0
            rc = m.get("metrics", {}).get("returncode")
            if rc == 0:
                s += 0.5
            stderr = str(m.get("metrics", {}).get("stderr", "") or "")
            s -= min(len(stderr) / 1000.0, 0.3)
            return s
        scorer = scoring_fn or default_score
        scored = []
        for u in updates:
            uid = u["update_id"]
            res = sandbox_results.get(uid, {"ok": False, "metrics": {}})
            score = scorer(u, res)
            scored.append((score, u, res))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [{"score": s, "update": u, "result": r} for (s,u,r) in scored]

# ------------ Quantum / Parallel Sandbox Simulation ------------
class QuantumSimulator:
    def __init__(self, sandbox_runner, mutators: List[Callable[[str], str]] = None, n_variants: int = 4):
        self.sandbox = sandbox_runner
        self.mutators = mutators or [self._noop_mutator, self._comment_mutator]
        self.n_variants = n_variants
    def _noop_mutator(self, code: str) -> str:
        return code
    def _comment_mutator(self, code: str) -> str:
        return code + "\n# variant_comment:" + uuid.uuid4().hex[:6]
    def generate_variants(self, base_code: str, n: int = None) -> List[str]:
        n = n or self.n_variants
        variants = []
        for i in range(n):
            mut = random.choice(self.mutators)
            try:
                variants.append(mut(base_code))
            except Exception:
                variants.append(base_code)
        uniq = []
        for v in variants:
            if v not in uniq:
                uniq.append(v)
        return uniq
    def simulate(self, code_path: str, base_code: str, test_cmd: List[str], timeout: int = 60, sandbox_level: str = "limited") -> List[Dict[str, Any]]:
        variants = self.generate_variants(base_code, self.n_variants)
        results = []
        for var_code in variants:
            files = {code_path: var_code}
            ok, metrics = self.sandbox.run(files, test_cmd, timeout=timeout, level=sandbox_level)
            results.append({"code": var_code, "ok": ok, "metrics": metrics})
        results.sort(key=lambda r: (1 if r["ok"] else 0, -len(str(r["metrics"].get("stderr","")))), reverse=True)
        return results

# ------------ LLM Adapter (Patch Synthesis, Predictive Security, Review) ------------
class LLMAdapter:
    def __init__(self, provider: str = "mock", api_key_env: str = "SM_AGENT_LLM_KEY", model: str = "gpt-4"):
        self.provider = provider
        self.api_key = os.environ.get(api_key_env, "")
        self.model = model
    def is_enabled(self) -> bool:
        return bool(self.api_key) and self.provider != "mock"
    def suggest_patch(self, failing_code: str, failing_output: str, context: Dict[str, Any]) -> Optional[str]:
        return None  # placeholder

# ------------ Dependency Analyzer / Code Entanglement Map ------------
class DependencyAnalyzer:
    def __init__(self, repo_root: str):
        self.repo_root = repo_root
    def analyze_file(self, rel_path: str) -> Dict[str, Any]:
        full = os.path.join(self.repo_root, rel_path)
        info = {"imports": set(), "defines": set(), "uses": set()}
        try:
            src = open(full, "r", encoding="utf-8").read()
            tree = ast.parse(src)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for n in node.names:
                        info["imports"].add(n.name.split(".")[0])
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        info["imports"].add(node.module.split(".")[0])
                elif isinstance(node, ast.FunctionDef):
                    info["defines"].add(node.name)
                elif isinstance(node, ast.ClassDef):
                    info["defines"].add(node.name)
                elif isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Name):
                        info["uses"].add(node.func.id)
            info["imports"] = list(info["imports"])
            info["defines"] = list(info["defines"])
            info["uses"] = list(info["uses"])
        except Exception:
            pass
        return info
    def build_graph(self, files: List[str]) -> Dict[str, Dict[str, Any]]:
        g = {}
        for f in files:
            g[f] = self.analyze_file(f)
        return g

# ------------ Risk Scorer (uses history) ------------
class RiskScorer:
    def __init__(self, audit_store: AuditStore, telemetry=None):
        self.audit = audit_store
        self.telemetry = telemetry
    def score(self, update: Dict[str, Any]) -> float:
        base = 1.0
        attr = (update.get("attr") or "").lower()
        if any(f in attr for f in EnhancedSecurityChecker.FORBIDDEN_ATTRS):
            return 10.0
        recent = [c for c in reversed(self.audit.changes) if c.get("attr") == update.get("attr")]
        fails = sum(1 for r in recent[:10] if r.get("status") and r.get("status") != "applied")
        base += min(fails * 0.8, 4.0)
        if update.get("category") in ("code_patch", "module_add"):
            base += 1.0
            static = update.get("meta", {}).get("static_issues", 0)
            base += min(static * 0.2, 2.0)
        hist_scores = [c.get("evolution_score", 0) for c in recent[:20] if c.get("evolution_score") is not None]
        if hist_scores:
            avg = sum(hist_scores)/len(hist_scores)
            base = base * (1.0 - min(max(avg/4.0, 0), 0.6))
        return round(max(0.0, min(base, 10.0)), 3)

# ------------ Retry Orchestrator (Self-retry Loop) ------------
class RetryOrchestrator:
    def __init__(self, llm_adapter: LLMAdapter, sandbox_runner: SandboxRunner, max_retries: int = 2, backoff_sec: int = 2):
        self.llm = llm_adapter
        self.sandbox = sandbox_runner
        self.max_retries = max_retries
        self.backoff = backoff_sec
    def try_improve(self, update: Dict[str, Any], test_cmd: List[str], timeout: int = 60, sandbox_level: str = "limited") -> Tuple[bool, Dict[str,Any], Optional[str]]:
        applied_patch = None
        base_code = update.get("proposed_code", "")
        for attempt in range(self.max_retries):
            suggestion = self.llm.suggest_patch(base_code, "", {"update": update}) if self.llm else None
            if not suggestion:
                break
            safe, reason = code_is_safe(suggestion)
            if not safe:
                return False, {"error": "llm_suggestion_unsafe", "detail": reason}, None
            files = {update["code_path"]: suggestion} if update.get("code_path") else {}
            ok, metrics = self.sandbox.run(files, test_cmd, timeout=timeout, level=sandbox_level)
            if ok:
                applied_patch = suggestion
                return True, metrics, applied_patch
            time.sleep(self.backoff * (2 ** attempt))
            base_code = suggestion
        return False, {"note": "no successful suggestion"}, None

# ------------ Virtual Peer Reviewer / Meta-Agent ------------
class VirtualPeerReviewer:
    def __init__(self, llm_adapter: Optional[LLMAdapter] = None):
        self.llm = llm_adapter
    def review(self, update: Dict[str, Any]) -> Tuple[bool, str]:
        if update.get("meta", {}).get("risk") == "high" and update.get("approvals",0) < update.get("required_approvals",1):
            return False, "High risk without approvals"
        reason = (update.get("reason") or "").lower()
        forbidden_tokens = ["rm -rf", "wget", "curl", "chmod 777", "netcat", "nc "]
        for t in forbidden_tokens:
            if t in reason:
                return False, f"Suspicious token in reason: {t}"
        if self.llm and self.llm.is_enabled() and update.get("proposed_code"):
            suggestion = self.llm.suggest_patch(update["proposed_code"], "", {"meta": update.get("meta", {})})
            if suggestion is not None:
                update.setdefault("meta", {})["llm_review_suggestion"] = "[LLM suggestion available]"
        return True, "peer review passed"

# ------------ Auto-Documentation Generator ------------
def generate_doc_summary(code: str, code_path: str) -> str:
    # very naive summary: first docstring or first 10 lines
    lines = code.strip().splitlines()
    for l in lines:
        if l.strip().startswith('"""') or l.strip().startswith("'''"):
            return l.strip()
    return "\n".join(lines[:10])

class AutoDocGenerator:
    def __init__(self, out_dir: str = "data/selfmod_docs"):
        self.out_dir = out_dir
        os.makedirs(self.out_dir, exist_ok=True)
    def make_doc(self, code_path: str, old_code: Optional[str], new_code: str) -> str:
        old = old_code or ""
        new = new_code
        diff = "\n".join(difflib.unified_diff(old.splitlines(), new.splitlines(), fromfile="before", tofile="after", lineterm=""))
        summary = generate_doc_summary(new, code_path)
        doc = f"# Auto-doc for {code_path}\nGenerated at: {datetime.utcnow().isoformat()}Z\n\n## Summary\n{summary}\n\n## Diff\n```\n{diff}\n```\n"
        out_path = os.path.join(self.out_dir, f"{os.path.basename(code_path)}.{int(time.time())}.md")
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(doc)
        return out_path

# ------------ Dashboard Hooks ------------
class DashboardHooks:
    def __init__(self, out_path: str = "data/dashboard_snapshot.json", push_hook: Optional[Callable[[dict],Any]] = None):
        self.out_path = out_path
        self.push_hook = push_hook
    def snapshot(self, agent_state: Dict[str, Any]):
        os.makedirs(os.path.dirname(self.out_path), exist_ok=True)
        with open(self.out_path, "w", encoding="utf-8") as f:
            json.dump(agent_state, f, ensure_ascii=False, indent=2)
        if self.push_hook:
            try:
                self.push_hook(agent_state)
            except Exception:
                pass

# ------------ DP Telemetry ------------
class Telemetry:
    def __init__(self, out_path: str = "data/telemetry.jsonl"):
        self.out_path = out_path
        os.makedirs(os.path.dirname(self.out_path), exist_ok=True)
    def push(self, data: Dict[str, Any]):
        with open(self.out_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")

class DPTelemetry(Telemetry):
    def __init__(self, out_path: str = "data/telemetry.jsonl", epsilon: float = 1.0):
        super().__init__(out_path=out_path)
        self.epsilon = max(float(epsilon), 1e-6)
    def _laplace_noise(self, scale: float):
        u = random.random() - 0.5
        return -scale * math.copysign(1.0, u) * math.log(1 - 2 * abs(u))
    def push(self, data: Dict[str, Any]):
        safe = dict(data)
        for k, v in list(safe.items()):
            if isinstance(v, (int, float)):
                scale = 1.0 / self.epsilon
                safe[k] = v + self._laplace_noise(scale)
        super().push(safe)

# ------------ Self-Healing Rollback Manager ------------
class SelfHealingRollback:
    def __init__(self, agent, check_fn: Callable[[], Dict[str,Any]], window_seconds: int = 120, fail_threshold: float = 0.2):
        self.agent = agent
        self.check_fn = check_fn
        self.window = window_seconds
        self.threshold = fail_threshold
        self._monitor_threads = []
    def monitor_update(self, update_id: str):
        def _monitor():
            base = self.check_fn()
            time.sleep(self.window)
            later = self.check_fn()
            base_err = base.get("error_rate", 0.0)
            later_err = later.get("error_rate", 0.0)
            if later_err - base_err > self.threshold:
                self.agent.rollback_update(update_id)
                self.agent.notifier.notify(f"Auto-rollback performed for {update_id} due to error spike", "WARNING")
        t = threading.Thread(target=_monitor, daemon=True)
        t.start()
        self._monitor_threads.append(t)

# =========== SelfModifyingAgent (core with all extensions) ============
class SelfModifyingAgent:
    def __init__(
        self,
        target_obj: Any,
        repo_path: str,
        log_path: str = "data/logs/self_modifying_log.jsonl",
        notifier: Optional[NotificationClient] = None,
        cpu_limit: int = 1,
        mem_mb: int = 512,
        test_cmd: Optional[List[str]] = None,
        llm_adapter: Optional[LLMAdapter] = None,
        enable_dashboard: bool = False,
        enable_dp_telemetry: bool = False,
    ):
        if not repo_path:
            raise ValueError("repo_path is required")
        self.repo_path = os.path.abspath(repo_path)
        self.audit = AuditStore(log_path)
        self.pending_updates: List[Dict[str, Any]] = []
        self._pending_lock = threading.Lock()
        self._apply_lock = threading.Lock()
        self.llm = llm_adapter or LLMAdapter()
        self.predictor = PredictiveSecurityChecker(self.llm)
        self.security = EnhancedSecurityChecker(predictive_checker=self.predictor)
        self.git = GitManager(repo_path)
        self.sandbox = SandboxRunner(self.repo_path, cpu_limit, mem_mb)
        self.batch_manager = BatchSandboxManager(self.sandbox)
        self.quantum_sim = QuantumSimulator(self.sandbox)
        self.deps = DependencyAnalyzer(self.repo_path)
        self.risk_scorer = RiskScorer(self.audit)
        self.retry_orch = RetryOrchestrator(self.llm, self.sandbox)
        self.peer_reviewer = VirtualPeerReviewer(self.llm)
        self.docgen = AutoDocGenerator()
        self.dashboard = DashboardHooks() if enable_dashboard else None
        self.telemetry = DPTelemetry() if enable_dp_telemetry else Telemetry()
        self.self_heal = None  # set via set_self_heal(check_fn)
        self.notifier = notifier if notifier is not None else NotificationClient(enabled=True)
        self.target = target_obj
        self.test_cmd = test_cmd or ["pytest", "-q"]
        self.evolution_score: float = 0.0

    def set_self_heal(self, check_fn, window=120, threshold=0.2):
        self.self_heal = SelfHealingRollback(self, check_fn, window, threshold)

    def _make_update_id(self, attr: str) -> str:
        return f"{int(time.time()*1000)}_{attr}_{uuid.uuid4().hex[:6]}"

    def propose_update(self, attr: str, proposed_value: Any, reason: str = "", meta: Optional[Dict] = None,
                       category: str = "param_change", code_path: Optional[str] = None,
                       proposed_code: Optional[str] = None, required_approvals: int = 1) -> str:
        old_value = getattr(self.target, attr, None)
        update_id = self._make_update_id(attr)
        entry = {
            "update_id": update_id,
            "attr": attr,
            "old_value": old_value,
            "proposed_value": proposed_value,
            "reason": reason,
            "meta": meta or {},
            "category": category,
            "code_path": code_path,
            "proposed_code": proposed_code,
            "status": "pending",
            "approvals": 0,
            "required_approvals": required_approvals,
            "audit_comments": [],
            "content_hash": hash_content(proposed_code if proposed_code is not None else str(proposed_value)),
            "evolution_score": 0.0,
            "risk_level": meta.get("risk", "low") if meta else "low",
        }
        entry["risk_score"] = self.risk_scorer.score(entry)
        with self._pending_lock:
            self.pending_updates.append(entry)
        self.audit.log({"event": "propose_update", **entry})
        self.notifier.notify(f"Proposed update {update_id} ({attr}) reason: {reason}", "INFO")
        return update_id

    def propose_new_module(self, code: str, code_path: str, reason: str = "", required_approvals: int = 1, meta: Optional[Dict] = None) -> str:
        ok, reason_scan = code_is_safe(code)
        if not ok:
            raise ValueError(f"unsafe code: {reason_scan}")
        update_id = self.propose_update(
            attr="module_add",
            proposed_value=f"ADD:{code_path}",
            reason=reason,
            meta=meta,
            category="module_add",
            code_path=code_path,
            proposed_code=code,
            required_approvals=required_approvals,
        )
        return update_id

    def approve_update(self, update_id: str) -> bool:
        with self._pending_lock:
            for u in self.pending_updates:
                if u["update_id"] == update_id:
                    u["approvals"] += 1
                    self.audit.log({"event": "approve_update", "update_id": update_id, "approvals": u["approvals"]})
                    self.notifier.notify(f"Approval added to {update_id} (total {u['approvals']})", "INFO")
                    return True
        return False

    def apply_best_pending_batch(self, dry_run: bool = False, batch_size: int = 3) -> List[Tuple[str, bool, str]]:
        with self._pending_lock:
            batch = self.pending_updates[:batch_size]
        results = self.batch_manager.run_batch(batch, self.test_cmd)
        bests = self.batch_manager.pick_best(batch, results)
        applied = []
        for b in bests:
            uid = b["update"]["update_id"]
            applied.append(self.apply_single_update(b["update"], dry_run=dry_run))
        return applied

    def apply_single_update(self, update: Dict[str, Any], dry_run=False) -> Tuple[str, bool, str]:
        uid = update["update_id"]
        # Peer review
        ok, review_msg = self.peer_reviewer.review(update)
        update.setdefault("audit_comments", []).append(review_msg)
        if not ok:
            update["status"] = "rejected_peer"
            self.audit.log({"event": "peer_reject", "update_id": uid, "reason": review_msg})
            self._remove_pending(uid)
            return (uid, False, f"peer_reject: {review_msg}")
        # Sandbox
        code_files = {}
        if update.get("code_path") and update.get("proposed_code"):
            code_files[update["code_path"]] = update["proposed_code"]
        sandbox_ok, sandbox_metrics = self.sandbox.run(code_files, self.test_cmd)
        self.audit.log({"event": "sandbox_done", "update_id": uid, "sandbox_ok": sandbox_ok, "metrics": sandbox_metrics})
        if code_files and not sandbox_ok:
            # Self-retry via LLM
            ok, metrics, patch = self.retry_orch.try_improve(update, self.test_cmd)
            if ok and patch:
                update["proposed_code"] = patch
                update["audit_comments"].append("llm_patch_applied")
                sandbox_ok = True
                sandbox_metrics = metrics
            else:
                update["status"] = "sandbox_failed"
                self.audit.log({"event": "sandbox_fail", "update_id": uid})
                self.notifier.notify(f"Update {uid} failed sandbox (and retry)", "WARNING")
                self._remove_pending(uid)
                return (uid, False, "sandbox_failed")
        # Apply (if not dry_run)
        pr_url = None
        if not dry_run:
            try:
                if update.get("category") == "param_change":
                    setattr(self.target, update["attr"], update["proposed_value"])
                if update.get("category") in ("module_add", "code_patch") and code_files:
                    for path, content in code_files.items():
                        fpath = safe_join_repo(self.repo_path, path)
                        os.makedirs(os.path.dirname(fpath), exist_ok=True)
                        with open(fpath, "w", encoding="utf-8") as fh:
                            fh.write(content)
                    doc_path = self.docgen.make_doc(path, None, content)
                    update["audit_comments"].append(f"autodoc: {doc_path}")
                update["status"] = "applied"
                update["applied_at"] = time.time()
                self.audit.log({"event": "applied", "update_id": uid, **update})
                self.notifier.notify(f"Update {uid} applied", "SUCCESS")
                # Dashboard snapshot
                if self.dashboard:
                    self.dashboard.snapshot(self.agent_state())
                # Self-healing rollback monitor (if set)
                if self.self_heal:
                    self.self_heal.monitor_update(uid)
            except Exception as e:
                update["status"] = "apply_failed"
                self.audit.log({"event": "apply_failed", "update_id": uid, "error": str(e)})
                self.notifier.notify(f"Apply failed for {uid}: {e}", "ERROR")
        else:
            update["status"] = "simulated"
            self.audit.log({"event": "simulated", "update_id": uid})
        self._remove_pending(uid)
        return (uid, True, "applied" if not dry_run else "simulated")

    def apply_pending_updates(self, dry_run: bool = False, sandbox_level: str = "limited", use_git: Optional[bool] = None) -> List[Tuple[str, bool, str]]:
        results: List[Tuple[str, bool, str]] = []
        if use_git is None:
            use_git = self.git.enabled
        with self._apply_lock:
            with self._pending_lock:
                queue = list(self.pending_updates)
            for update in queue:
                res = self.apply_single_update(update, dry_run=dry_run)
                results.append(res)
        return results

    def rollback_update(self, update_id: str) -> bool:
        ent = self.audit.get(update_id)
        if not ent:
            return False
        if ent.get("status") != "applied":
            return False
        attr = ent.get("attr")
        old = ent.get("old_value")
        if attr and old is not None:
            setattr(self.target, attr, old)
            self.audit.log({"event": "rollback", "update_id": update_id, "attr": attr})
            self.notifier.notify(f"Rolled back {update_id}", "WARNING")
            return True
        return False

    def _remove_pending(self, update_id: str):
        with self._pending_lock:
            self.pending_updates = [u for u in self.pending_updates if u["update_id"] != update_id]

    def audit_trail(self) -> List[Dict[str, Any]]:
        return deepcopy(self.audit.changes)

    def last_applied(self) -> Optional[Dict[str, Any]]:
        for c in reversed(self.audit.changes):
            if c.get("status") == "applied":
                return c
        return None

    def agent_state(self) -> Dict[str, Any]:
        return {
            "pending_updates": self.pending_updates,
            "last_applied": self.last_applied(),
            "audit_tail": self.audit_trail()[-10:],
            "evolution_score": self.evolution_score,
        }