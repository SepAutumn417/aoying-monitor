from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_returns_ok() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "aoying-monitor"


def test_healthz_returns_503_when_database_fails(monkeypatch) -> None:
    from app.api import health

    class FailingEngine:
        def connect(self):
            raise RuntimeError("db connection failed")

    monkeypatch.setattr(health, "engine", FailingEngine())
    response = client.get("/healthz")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "error"


def test_root_identifies_service() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["name"] == "aoying-monitor"
