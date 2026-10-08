import base64
from test_api import client as client, login, send
from app import db
from app.features import purge_expired


def test_edit_and_delete_message_permissions_visibility_and_replies(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    outsider, _ = login(client, "outsider")
    mid = send(client, alex, 1, "Original", "edit-delete").json()["id"]
    path = f"/conversations/1/messages/{mid}"
    assert client.patch(path, headers=maya, json={"body": "No"}).status_code == 403
    assert client.patch(path, headers=outsider, json={"body": "No"}).status_code == 403
    assert client.patch(path, headers=alex, json={"body": "Updated"}).status_code == 200
    reply = send(client, maya, 1, "I agree", "quoting", mid).json()["id"]
    maya_rows = client.get("/conversations/1/messages", headers=maya).json()
    assert next(m for m in maya_rows if m["id"] == mid)["edited_at"]
    assert next(m for m in maya_rows if m["id"] == reply)["reply_body"] == "Updated"
    assert client.delete(path + "?scope=everyone", headers=maya).status_code == 403
    assert client.delete(path + "?scope=me", headers=maya).status_code == 200
    assert all(m["id"] != mid for m in client.get("/conversations/1/messages", headers=maya).json())
    assert next(m for m in client.get("/conversations/1/messages", headers=maya).json() if m["id"] == reply)["reply_body"] is None
    assert any(m["id"] == mid for m in client.get("/conversations/1/messages", headers=alex).json())
    assert client.delete(path + "?scope=everyone", headers=alex).status_code == 200
    assert client.patch(path, headers=alex, json={"body": "Again"}).status_code == 404
    tombstone = next(m for m in client.get("/conversations/1/messages", headers=alex).json() if m["id"] == mid)
    assert tombstone["body"] == "This message was deleted" and tombstone["deleted_at"]
    assert send(client, maya, 1, "No quote", "bad-quote", mid).status_code == 422


def test_delete_attachment_removes_bytes_and_prevents_reactions(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    response = client.post("/conversations/1/messages", headers=alex, json={"client_id": "delete-file", "body": "File", "attachment": {"name": "x.txt", "data": base64.b64encode(b"secret bytes").decode()}})
    mid = response.json()["id"]
    path = f"/conversations/1/messages/{mid}"
    assert client.patch(path, headers=alex, json={"body": "Edited"}).status_code == 422
    assert client.delete(path + "?scope=everyone", headers=alex).status_code == 200
    assert client.get(path + "/attachment", headers=maya).status_code == 404
    assert client.post(path + "/reactions", headers=maya, json={"emoji": "👍"}).status_code == 404
    with db.connect() as conn:
        assert conn.execute("SELECT count(*) FROM attachments WHERE message_id=?", (mid,)).fetchone()[0] == 0


def test_attachment_roundtrip_access_and_idempotency(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    outsider, _ = login(client, "outsider")
    payload = {
        "client_id": "file",
        "body": "Notes",
        "attachment": {
            "name": "notes.txt",
            "data": base64.b64encode(b"hello").decode(),
        },
    }
    result = client.post("/conversations/1/messages", headers=alex, json=payload)
    assert result.status_code == 200, result.text
    mid = result.json()["id"]
    assert (
        client.post("/conversations/1/messages", headers=alex, json=payload).json()[
            "id"
        ]
        == mid
    )
    path = f"/conversations/1/messages/{mid}/attachment"
    assert client.get(path, headers=outsider).status_code == 403
    assert client.get(path).status_code == 401
    downloaded = client.get(path, headers=maya)
    assert downloaded.content == b"hello"
    assert downloaded.headers["cache-control"] == "no-store"
    assert downloaded.headers["content-type"] == "application/octet-stream"
    last = client.get("/conversations/1/messages", headers=maya).json()[-1]
    assert last["attachment"] == {
        "name": "notes.txt",
        "media_type": "application/octet-stream",
        "size": 5,
    }
    with db.connect() as conn:
        assert (
            conn.execute(
                "SELECT count(*) FROM attachments WHERE message_id=?", (mid,)
            ).fetchone()[0]
            == 1
        )


def test_attachment_validation_and_image_detection(client):
    alex, _ = login(client, "alex")
    for content in [
        "",
        "bad encoding!",
        base64.b64encode(b"x" * (10 * 1024 * 1024 + 1)).decode(),
    ]:
        result = client.post(
            "/conversations/1/messages",
            headers=alex,
            json={
                "client_id": "bad-file",
                "attachment": {"name": "x", "data": content},
            },
        )
        assert result.status_code in (413, 422)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
    )
    result = client.post(
        "/conversations/1/messages",
        headers=alex,
        json={
            "client_id": "image",
            "attachment": {
                "name": "../photo.png",
                "data": base64.b64encode(png).decode(),
            },
        },
    )
    assert result.status_code == 200, result.text
    mid = result.json()["id"]
    response = client.get(f"/conversations/1/messages/{mid}/attachment", headers=alex)
    assert response.headers["content-type"] == "image/png"
    assert response.content == png
    assert "photo.png" in response.headers["content-disposition"]


def test_reactions_replace_toggle_and_authorization(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    outsider, _ = login(client, "outsider")
    mid = send(client, alex, 1, client_id="reacted").json()["id"]
    path = f"/conversations/1/messages/{mid}/reactions"
    assert client.post(path, headers=outsider, json={"emoji": "❤️"}).status_code == 403
    assert client.post(path, headers=maya, json={"emoji": "bad"}).status_code == 422
    for h in [alex, maya]:
        assert client.post(path, headers=h, json={"emoji": "❤️"}).status_code == 200
    assert (
        len(
            client.get("/conversations/1/messages", headers=alex).json()[-1][
                "reactions"
            ]
        )
        == 2
    )
    client.post(path, headers=maya, json={"emoji": "👍"})
    assert {
        r["emoji"]
        for r in client.get("/conversations/1/messages", headers=alex).json()[-1][
            "reactions"
        ]
    } == {"❤️", "👍"}
    client.post(path, headers=maya, json={"emoji": "👍"})
    assert (
        len(
            client.get("/conversations/1/messages", headers=alex).json()[-1][
                "reactions"
            ]
        )
        == 1
    )


def test_timers_permissions_and_new_messages_only(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    outsider, _ = login(client, "outsider")
    old = send(client, alex, 1, client_id="before").json()["id"]
    path = "/conversations/1/timer"
    assert client.patch(path, headers=outsider, json={"seconds": 10}).status_code == 403
    assert client.patch(path, headers=maya, json={"seconds": 12}).status_code == 422
    assert client.patch(path, headers=maya, json={"seconds": 10}).status_code == 200
    new = send(client, alex, 1, client_id="timed").json()["id"]
    with db.connect() as conn:
        assert (
            conn.execute(
                "SELECT expires_at FROM messages WHERE id=?", (old,)
            ).fetchone()[0]
            is None
        )
        assert (
            conn.execute(
                "SELECT expires_at FROM messages WHERE id=?", (new,)
            ).fetchone()[0]
            is not None
        )
    assert (
        client.patch(
            "/conversations/2/timer", headers=maya, json={"seconds": 60}
        ).status_code
        == 403
    )
    assert (
        client.patch(
            "/conversations/2/timer", headers=alex, json={"seconds": 60}
        ).status_code
        == 200
    )
    client.patch(path, headers=alex, json={"seconds": 0})
    later = send(client, alex, 1, client_id="untimed").json()["id"]
    with db.connect() as conn:
        assert (
            conn.execute(
                "SELECT expires_at FROM messages WHERE id=?", (later,)
            ).fetchone()[0]
            is None
        )
        assert (
            conn.execute(
                "SELECT expires_at FROM messages WHERE id=?", (new,)
            ).fetchone()[0]
            is not None
        )


def test_expiry_deletes_bytes_reactions_receipts_and_quote(client):
    alex, _ = login(client, "alex")
    maya, _ = login(client, "maya")
    client.patch("/conversations/1/timer", headers=alex, json={"seconds": 10})
    mid = client.post(
        "/conversations/1/messages",
        headers=alex,
        json={
            "client_id": "expires",
            "body": "Secret demo",
            "attachment": {
                "name": "note.txt",
                "data": base64.b64encode(b"ephemeral").decode(),
            },
        },
    ).json()["id"]
    client.post(
        f"/conversations/1/messages/{mid}/reactions", headers=maya, json={"emoji": "❤️"}
    )
    client.patch("/conversations/1/timer", headers=alex, json={"seconds": 0})
    reply = send(client, maya, 1, "A lasting reply", "reply-expiry", mid).json()["id"]
    with db.connect() as conn:
        conn.execute(
            "UPDATE messages SET expires_at=? WHERE id=?",
            ("2000-01-01T00:00:00+00:00", mid),
        )
    assert (
        client.get(
            f"/conversations/1/messages/{mid}/attachment", headers=alex
        ).status_code
        == 404
    )
    rows = client.get("/conversations/1/messages", headers=alex).json()
    assert not any(r["id"] == mid for r in rows)
    assert next(r for r in rows if r["id"] == reply)["reply_body"] is None
    purge_expired()
    with db.connect() as conn:
        for table, column in [
            ("messages", "id"),
            ("attachments", "message_id"),
            ("reactions", "message_id"),
            ("receipts", "message_id"),
        ]:
            assert (
                conn.execute(
                    f"SELECT count(*) FROM {table} WHERE {column}=?", (mid,)
                ).fetchone()[0]
                == 0
            )
        assert (
            conn.execute(
                "SELECT reply_to FROM messages WHERE id=?", (reply,)
            ).fetchone()[0]
            is None
        )
    assert (
        client.post(
            f"/conversations/1/messages/{mid}/reactions",
            headers=alex,
            json={"emoji": "❤️"},
        ).status_code
        == 404
    )


def test_expired_retry_cannot_resurrect_a_message(client):
    alex, _ = login(client, "alex")
    client.patch("/conversations/1/timer", headers=alex, json={"seconds": 10})
    mid = send(client, alex, 1, "Expire once", "retry-expired").json()["id"]
    with db.connect() as conn:
        conn.execute(
            "UPDATE messages SET expires_at=? WHERE id=?",
            ("2000-01-01T00:00:00+00:00", mid),
        )
    purge_expired()
    assert send(client, alex, 1, "Expire once", "retry-expired").status_code == 409
    with db.connect() as conn:
        assert (
            conn.execute(
                "SELECT count(*) FROM messages WHERE client_id=?", ("retry-expired",)
            ).fetchone()[0]
            == 0
        )
