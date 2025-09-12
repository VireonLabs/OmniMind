import os
import threading
import time
import pytest
from services.model.self_modifying_agent import SelfModifyingAgent, NotificationClient

# --------- Dummy Model for Testing ---------
class DummyModel:
    lr = 0.1
    threshold = 0.5
    secret = "xxx"

# --------- Utilities for Cleanup ---------
def remove_file(path):
    try:
        os.remove(path)
    except Exception:
        pass

def remove_dir(path):
    try:
        if os.path.isdir(path):
            for f in os.listdir(path):
                remove_file(os.path.join(path, f))
            os.rmdir(path)
    except Exception:
        pass

# --------- Mock Notification ---------
class MockNotifier(NotificationClient):
    def __init__(self):
        super().__init__(enabled=False)
    def notify(self, msg, level="INFO"):
        pass

# --------- Test Suite ---------
def test_param_update_and_rollback(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    update_id = agent.propose_update("lr", 0.15, reason="increase lr", required_approvals=1)
    agent.approve_update(update_id)
    result = agent.apply_pending_updates(dry_run=True)
    assert model.lr == 0.1
    assert result[0][1] is True and result[0][2] == "simulated"
    # Now actually apply
    agent.approve_update(update_id) # test idempotency
    result = agent.apply_pending_updates()
    assert model.lr == 0.15
    # Rollback
    assert agent.rollback_update(update_id)
    assert model.lr == 0.1
    remove_file(log_path)

def test_forbidden_attr(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log2.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    update_id = agent.propose_update("secret", "hacked", reason="should fail", required_approvals=1)
    agent.approve_update(update_id)
    result = agent.apply_pending_updates()
    assert result[0][1] is False
    with open(log_path) as f:
        assert "forbidden" in f.read()
    remove_file(log_path)

def test_module_add_sandbox_fail(monkeypatch, tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log3.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    code = "def bad_code(:\n pass"
    update_id = agent.propose_new_module(code, "bad.py", "broken code", required_approvals=1)
    agent.approve_update(update_id)
    # Force sandbox to fail
    monkeypatch.setattr(agent.sandbox, "run", lambda *a, **kw: (False, {"error": "sandbox failed"}))
    result = agent.apply_pending_updates()
    assert result[0][1] is False and "sandbox_failed" in result[0][2]
    remove_file(log_path)
    remove_file(tmp_path / "bad.py")

def test_m_of_n_approvals(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log4.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    update_id = agent.propose_update("threshold", 0.9, reason="sensitive", required_approvals=2)
    # Only one approval: should not apply
    agent.approve_update(update_id)
    result = agent.apply_pending_updates()
    assert result[0][2] == "waiting_approvals"
    # Add second approval: now should apply
    agent.approve_update(update_id)
    result = agent.apply_pending_updates()
    assert model.threshold == 0.9
    # Rollback
    assert agent.rollback_update(update_id)
    assert model.threshold == 0.5
    remove_file(log_path)

def test_path_traversal_rejected(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log5.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    bad_path = "../../etc/passwd"
    code = "print('pwnd!')"
    with pytest.raises(ValueError):
        agent.propose_new_module(code, bad_path, "illegal path")
    remove_file(log_path)

def test_static_code_scan_reject(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log6.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    code = "import os\nos.system('rm -rf /')"
    with pytest.raises(ValueError):
        agent.propose_new_module(code, "danger.py", "dangerous code")
    remove_file(log_path)

def test_batch_sandbox_best(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log7.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    # Add two updates, one valid, one invalid
    good_code = "def good():\n return 1"
    bad_code = "def bad(:\n pass"
    update1 = agent.propose_new_module(good_code, "good.py", "good", required_approvals=1)
    update2 = agent.propose_new_module(bad_code, "bad.py", "bad", required_approvals=1)
    agent.approve_update(update1)
    agent.approve_update(update2)
    # Monkeypatch sandbox: good code passes, bad code fails
    def mock_run(files, *a, **kw):
        for p in files:
            if "bad" in p:
                return False, {"error": "bad code"}
        return True, {"returncode": 0}
    agent.sandbox.run = mock_run
    results = agent.apply_best_pending_batch()
    assert any(r[1] for r in results)  # At least one applied
    remove_file(tmp_path / "good.py")
    remove_file(tmp_path / "bad.py")
    remove_file(log_path)

def test_concurrent_modifications(tmp_path):
    model = DummyModel()
    log_path = tmp_path / "log8.jsonl"
    agent = SelfModifyingAgent(model, repo_path=str(tmp_path), log_path=str(log_path), notifier=MockNotifier())
    update_id1 = agent.propose_update("lr", 0.2, "thread1", required_approvals=1)
    update_id2 = agent.propose_update("threshold", 0.6, "thread2", required_approvals=1)
    agent.approve_update(update_id1)
    agent.approve_update(update_id2)
    # Run apply in two threads
    results = []
    def t1():
        results.append(agent.apply_pending_updates())
    def t2():
        results.append(agent.apply_pending_updates())
    th1 = threading.Thread(target=t1)
    th2 = threading.Thread(target=t2)
    th1.start(); th2.start()
    th1.join(); th2.join()
    # Both updates should be applied without conflict
    assert model.lr == 0.2
    assert model.threshold == 0.6
    remove_file(log_path)