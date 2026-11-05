from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz_returns_ok() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "aoying-monitor"


def test_root_identifies_service() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["name"] == "aoying-monitor"
