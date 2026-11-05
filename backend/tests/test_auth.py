"""Authentication, device registration and websocket ticket tests."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app

ADMIN = {"username": "admin", "password": "test-password-123"}


def _login(client: TestClient, **device) -> dict:
    response = client.post("/api/auth/login", json={**ADMIN, "device": device})
    assert response.status_code == 200, response.text
    return response.json()


def test_login_returns_tokens_and_device() -> None:
    with TestClient(app) as client:
        data = _login(client, name="测试机", platform="android", fingerprint="fp-1")
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["user"]["username"] == "admin"
    assert data["device"]["fingerprint"] == "fp-1"


def test_login_rejects_wrong_password() -> None:
    with TestClient(app) as client:
        response = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert response.status_code == 401
    assert response.json()["detail"] == "用户名或密码不正确"


def test_login_registers_and_reuses_device_by_fingerprint() -> None:
    with TestClient(app) as client:
        first = _login(client, name="手机", fingerprint="fp-dup")
        second = _login(client, name="手机改名", fingerprint="fp-dup")
        headers = {"Authorization": f"Bearer {second['access_token']}"}
        devices = client.get("/api/devices", headers=headers).json()
    assert first["device"]["id"] == second["device"]["id"]
    assert second["device"]["name"] == "手机改名"
    assert len([d for d in devices if d["fingerprint"] == "fp-dup"]) == 1


def test_me_requires_token() -> None:
    with TestClient(app) as client:
        assert client.get("/api/auth/me").status_code == 401
        token = _login(client)["access_token"]
        response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["user"]["display_name"] == "管理员"


def test_refresh_rotates_the_token() -> None:
    with TestClient(app) as client:
        refresh_token = _login(client)["refresh_token"]
        first = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert first.status_code == 200
        reused = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert first.json()["refresh_token"] != refresh_token
    assert reused.status_code == 401


def test_logout_revokes_refresh_token() -> None:
    with TestClient(app) as client:
        session = _login(client)
        response = client.post(
            "/api/auth/logout",
            json={"refresh_token": session["refresh_token"]},
            headers={"Authorization": f"Bearer {session['access_token']}"},
        )
        after = client.post("/api/auth/refresh", json={"refresh_token": session["refresh_token"]})
    assert response.json() == {"ok": True}
    assert after.status_code == 401


def test_ws_ticket_is_single_use() -> None:
    with TestClient(app) as client:
        token = _login(client)["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        ticket = client.post("/api/ws/ticket", headers=headers).json()
        assert ticket["ticket"]
        assert ticket["ws_url"].startswith("ws://")

        with client.websocket_connect(f"/ws?ticket={ticket['ticket']}") as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello"
            assert hello["last_event_id"] >= 0
            ws.send_json({"type": "ping"})
            assert ws.receive_json()["type"] == "pong"

        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/ws?ticket={ticket['ticket']}"):
                pass


def test_ws_rejects_unknown_ticket() -> None:
    with TestClient(app) as client, pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws?ticket=not-a-real-ticket"):
            pass


def test_test_event_reaches_the_live_socket() -> None:
    with TestClient(app) as client:
        session = _login(client, fingerprint="fp-live")
        headers = {"Authorization": f"Bearer {session['access_token']}"}
        ticket = client.post("/api/ws/ticket", headers=headers).json()["ticket"]
        with client.websocket_connect(f"/ws?ticket={ticket}") as ws:
            assert ws.receive_json()["type"] == "hello"
            client.post("/api/events/test", headers=headers)
            frame = ws.receive_json()
        assert frame["type"] == "event"
        assert frame["event"]["kind"] == "system.test"
        assert frame["event"]["payload"]["title"] == "测试提醒"


def test_missed_events_are_replayed_on_hello() -> None:
    with TestClient(app) as client:
        session = _login(client, fingerprint="fp-replay")
        headers = {"Authorization": f"Bearer {session['access_token']}"}
        before = client.get("/api/events?after=0&limit=1", headers=headers).json()["latest_id"]
        for _ in range(3):
            client.post("/api/events/test", headers=headers)
        ticket = client.post("/api/ws/ticket", headers=headers).json()["ticket"]
        with client.websocket_connect(f"/ws?ticket={ticket}") as ws:
            assert ws.receive_json()["type"] == "hello"
            ws.send_json({"type": "hello", "last_event_id": before})
            frame = ws.receive_json()
    assert frame["type"] == "replay"
    assert frame["count"] >= 3
