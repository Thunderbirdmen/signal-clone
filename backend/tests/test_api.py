import pytest
from fastapi.testclient import TestClient
from app import db
from app.main import app
from app.security import reset_limits
from app.realtime import hub


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("SEED_DEMO", "true")
    reset_limits()
    hub.clients.clear()
    with TestClient(app) as client:
        yield client


def login(client, name):
    if name in {"alex", "maya", "jordan", "sam", "riley"}:
        response = client.post("/auth/demo", json={"username": name})
    else:
        response = client.post(
            "/auth/register",
            json={
                "username": name,
                "display_name": name,
                "avatar": "💙",
                "password": "test-password-2026",
                "otp": "123456",
            },
        )
        if response.status_code == 409:
            response = client.post(
                "/auth/login", json={"username": name, "password": "test-password-2026"}
            )
    assert response.status_code == 200, response.text
    data = response.json()
    return {"Authorization": "Bearer " + data["token"]}, data


def send(client, headers, cid, body="Hello", client_id="test", reply=None):
    return client.post(
        f"/conversations/{cid}/messages",
        headers=headers,
        json={"body": body, "client_id": client_id, "reply_to": reply},
    )


def test_registration_persistence_and_logout(client):
    assert (
        client.post(
            "/auth/login",
            json={"username": "newuser", "password": "test-password-2026"},
        ).status_code
        == 401
    )
    h, data = login(client, "newuser")
    assert client.get("/me", headers=h).json()["username"] == "newuser"
    assert {person["username"] for person in client.get("/contacts", headers=h).json()} == {"alex", "maya", "jordan"}
    response = client.patch(
        "/me", headers=h, json={"display_name": "New Person", "avatar": "🚀"}
    )
    assert response.json()["display_name"] == "New Person"
    h2, d2 = login(client, "newuser")
    assert d2["user"]["display_name"] == "New Person"
    assert d2["user"]["id"] == data["user"]["id"]
    assert client.post("/auth/logout", headers=h).status_code == 200
    assert client.get("/me", headers=h).status_code == 401
    assert client.get("/me", headers=h2).status_code == 200


def test_separate_password_and_demo_authentication(client):
    assert (
        client.post(
            "/auth/register",
            json={"username": "badotp", "display_name": "Bad OTP", "password": "test-password-2026", "otp": "000000"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login", json={"username": "alex", "password": "123456"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login",
            json={"username": "missing", "password": "a-long-password-2026"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/register",
            json={"username": "shortpass", "display_name": "New", "password": "short", "otp": "123456"},
        ).status_code
        == 422
    )
    _, registered = login(client, "realaccount")
    assert (
        client.post(
            "/auth/register",
            json={
                "username": "realaccount",
                "display_name": "Again",
                "password": "test-password-2026",
                "otp": "123456",
            },
        ).status_code
        == 409
    )
    assert (
        client.post("/auth/demo", json={"username": "realaccount"}).status_code == 401
    )
    assert login(client, "realaccount")[1]["user"]["id"] == registered["user"]["id"]


def test_contacts_and_unique_direct_conversations(client):
    h, _ = login(client, "newuser")
    assert (
        client.post("/contacts", headers=h, json={"username": "missing"}).status_code
        == 404
    )
    result = client.post("/contacts", headers=h, json={"username": "maya"})
    uid = result.json()["id"]
    assert len(client.get("/contacts", headers=h).json()) == 3
    first = client.post(
        "/conversations/direct", headers=h, json={"user_id": uid}
    ).json()
    second = client.post(
        "/conversations/direct", headers=h, json={"user_id": uid}
    ).json()
    assert first == second
    maya, _ = login(client, "maya")
    assert any(
        c["id"] == first["id"]
        for c in client.get("/conversations", headers=maya).json()
    )


def test_authorization_and_validation(client):
    alex, _ = login(client, "alex")
    outsider, _ = login(client, "outsider")
    assert client.get("/conversations/1/messages").status_code == 401
    assert client.get("/conversations/1/messages", headers=outsider).status_code == 403
    assert send(client, outsider, 1).status_code == 403
    assert client.post("/conversations/1/read", headers=outsider).status_code == 403
    assert send(client, alex, 1, "   ").status_code == 422
    assert send(client, alex, 1, "x" * 4001).status_code == 422
    assert (
        client.patch(
            "/me", headers=alex, json={"display_name": " ", "avatar": "🚀"}
        ).status_code
        == 422
    )


def test_message_receipts_idempotency_reply_and_pagination(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    cid = 1
    client.post("/conversations/1/read", headers=maya)
    response = send(client, alex, cid, "A persistent hello", "unique")
    mid = response.json()["id"]
    assert send(client, alex, cid, "A persistent hello", "unique").json()["id"] == mid
    assert send(client, alex, 3, "Wrong conversation", "unique").status_code == 409
    messages = client.get("/conversations/1/messages", headers=alex).json()
    assert messages[-1]["status"] == "sent"
    assert sum(m["client_id"] == "unique" for m in messages) == 1
    maya_chats = client.get("/conversations", headers=maya).json()
    assert next(c for c in maya_chats if c["id"] == 1)["unread"] == 1
    client.post("/conversations/1/read", headers=maya)
    assert (
        client.get("/conversations/1/messages", headers=alex).json()[-1]["status"]
        == "read"
    )
    assert send(client, alex, 3, "Cross-chat quote", "badreply", mid).status_code == 422
    send(client, maya, cid, "A reply", "reply", mid)
    newest = client.get("/conversations/1/messages?limit=1", headers=alex).json()
    assert newest[0]["reply_body"] == "A persistent hello"
    older = client.get(
        f"/conversations/1/messages?before={newest[0]['id']}&limit=1", headers=alex
    ).json()
    assert older[0]["id"] == mid
    with db.connect() as conn:
        assert (
            conn.execute("SELECT body FROM messages WHERE id=?", (mid,)).fetchone()[0]
            == "A persistent hello"
        )


def test_group_admin_permissions_and_removed_members(client):
    alex, a = login(client, "alex")
    maya, m = login(client, "maya")
    riley, r = login(client, "riley")
    group = client.post(
        "/conversations/group",
        headers=alex,
        json={"name": "Study group", "member_ids": [m["user"]["id"]]},
    ).json()
    cid = group["id"]
    assert (
        client.post(
            f"/conversations/{cid}/members",
            headers=maya,
            json={"user_id": r["user"]["id"]},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/conversations/{cid}/members",
            headers=alex,
            json={"user_id": r["user"]["id"]},
        ).status_code
        == 200
    )
    assert send(client, riley, cid, "Hello group").status_code == 200
    assert (
        client.delete(
            f"/conversations/{cid}/members/{a['user']['id']}", headers=alex
        ).status_code
        == 422
    )
    assert (
        client.delete(
            f"/conversations/{cid}/members/{r['user']['id']}", headers=alex
        ).status_code
        == 200
    )
    assert (
        client.get(f"/conversations/{cid}/messages", headers=riley).status_code == 403
    )
    assert send(client, riley, cid, "Cannot send", "newid").status_code == 403


def test_group_rename_roles_leave_and_audit(client):
    alex, a = login(client, "alex")
    maya, m = login(client, "maya")
    group = client.post(
        "/conversations/group",
        headers=alex,
        json={"name": "First", "member_ids": [m["user"]["id"]]},
    )
    cid = group.json()["id"]
    name_url = f"/conversations/{cid}/name"
    role_url = f"/conversations/{cid}/members/{m['user']['id']}/role"
    assert (
        client.patch(name_url, headers=maya, json={"name": "Nope"}).status_code == 403
    )
    assert (
        client.patch(
            name_url, headers=alex, json={"name": "  Final name  "}
        ).status_code
        == 200
    )
    assert (
        next(
            c
            for c in client.get("/conversations", headers=maya).json()
            if c["id"] == cid
        )["name"]
        == "Final name"
    )
    assert (
        client.patch(
            f"/conversations/{cid}/members/{a['user']['id']}/role",
            headers=alex,
            json={"role": "member"},
        ).status_code
        == 422
    )
    assert (
        client.patch(role_url, headers=maya, json={"role": "admin"}).status_code == 403
    )
    assert (
        client.patch(role_url, headers=alex, json={"role": "admin"}).status_code == 200
    )
    assert client.delete(f"/conversations/{cid}/leave", headers=alex).status_code == 200
    assert client.get(f"/conversations/{cid}/audit", headers=alex).status_code == 403
    activity = client.get(f"/conversations/{cid}/audit", headers=maya).json()
    assert [item["action"] for item in activity[:3]] == [
        "member_left",
        "admin_promoted",
        "group_renamed",
    ]
    assert client.delete(f"/conversations/{cid}/leave", headers=maya).status_code == 422


def test_password_privacy_demo_toggle_and_headers(client, monkeypatch):
    new, data = login(client, "secureuser")
    assert "password_hash" not in data["user"]
    response = client.get("/me", headers=new)
    assert "password_hash" not in response.json()
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert (
        client.post(
            "/auth/login",
            json={"username": "secureuser", "password": "incorrect-passphrase"},
        ).status_code
        == 401
    )
    with db.connect() as conn:
        stored = conn.execute(
            "SELECT password_hash FROM users WHERE username='secureuser'"
        ).fetchone()[0]
    assert stored.startswith("pbkdf2_sha256$") and "test-password-2026" not in stored
    monkeypatch.setenv("ENABLE_DEMO_LOGIN", "false")
    assert client.post("/auth/demo", json={"username": "alex"}).status_code == 401
    assert login(client, "secureuser")[1]["user"]["id"] == data["user"]["id"]


def test_websocket_delivery_typing_and_real_time_message(client):
    alex, a = login(client, "alex")
    maya, m = login(client, "maya")
    with client.websocket_connect(
        "/ws", headers={"origin": "http://localhost:3000"}
    ) as ws:
        ws.send_json({"token": m["token"]})
        assert ws.receive_json()["type"] == "sync"
        send(client, alex, 1, "Live message", "live")
        event = ws.receive_json()
        assert event["type"] == "sync" and event["conversation_id"] == 1
        assert (
            client.get("/conversations/1/messages", headers=alex).json()[-1]["status"]
            == "delivered"
        )
        with client.websocket_connect(
            "/ws", headers={"origin": "http://localhost:3000"}
        ) as sender:
            sender.send_json({"token": a["token"]})
            assert sender.receive_json()["type"] == "sync"
            assert ws.receive_json()["type"] == "sync"
            sender.send_json({"type": "typing", "conversation_id": 1})
            assert ws.receive_json()["type"] == "typing"
            sender.send_json({"type": "ping"})
            assert sender.receive_json()["type"] == "pong"
        assert ws.receive_json()["type"] == "sync"
    assert not hub.online(m["user"]["id"])


def test_seed_is_idempotent(client):
    from app.seed import seed

    with db.connect() as conn:
        count = conn.execute("SELECT count(*) FROM messages").fetchone()[0]
    seed()
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM messages").fetchone()[0] == count


def test_group_read_receipts_require_all_original_recipients(client):
    alex, _ = login(client, "alex")
    maya, m = login(client, "maya")
    jordan, j = login(client, "jordan")
    cid = client.post(
        "/conversations/group",
        headers=alex,
        json={"name": "Receipts", "member_ids": [m["user"]["id"], j["user"]["id"]]},
    ).json()["id"]
    send(client, alex, cid, "Group receipt test", "group-receipt")
    client.post(f"/conversations/{cid}/read", headers=maya)
    assert (
        client.get(f"/conversations/{cid}/messages", headers=alex).json()[-1]["status"]
        == "sent"
    )
    client.post(f"/conversations/{cid}/read", headers=jordan)
    assert (
        client.get(f"/conversations/{cid}/messages", headers=alex).json()[-1]["status"]
        == "read"
    )


def test_websocket_rejects_invalid_origin_and_token(client):
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/ws", headers={"origin": "https://untrusted.example"}
        ):
            pass
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/ws", headers={"origin": "http://localhost:3000"}
        ) as ws:
            ws.send_json({"token": "not-a-session"})
            ws.receive_json()


def test_logout_closes_socket_and_expiry_rejects_rest(client):
    from starlette.websockets import WebSocketDisconnect
    from app.main import digest

    h, data = login(client, "alex")
    with client.websocket_connect(
        "/ws", headers={"origin": "http://localhost:3000"}
    ) as ws:
        ws.send_json({"token": data["token"]})
        ws.receive_json()
        assert client.post("/auth/logout", headers=h).status_code == 200
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    h, data = login(client, "alex")
    with db.connect() as conn:
        conn.execute(
            "UPDATE sessions SET expires_at=? WHERE token_hash=?",
            ("2000-01-01T00:00:00+00:00", digest(data["token"])),
        )
    assert client.get("/me", headers=h).status_code == 401
