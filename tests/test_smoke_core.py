from services.model.core import CMSHModel
def test_status():
    m = CMSHModel()
    s = m.status()
    assert isinstance(s, dict)
    assert "state" in s
    assert "weights_state" in s