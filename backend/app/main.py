import asyncio
import hashlib
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import (
    Request,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from urllib.parse import quote
from contextlib import suppress
from .features import decode_attachment, purge_expired, REACTIONS, TIMERS
from pydantic import BaseModel, Field
from .db import connect, initialize
from .realtime import hub
from .seed import seed
from .security import rate_limit


def now():
    return datetime.now(timezone.utc).isoformat()


def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


@asynccontextmanager
async def lifespan(app):
    initialize()
    if os.getenv("SEED_DEMO", "true").lower() == "true":
        seed()
    with connect() as db:
        for row in db.execute("SELECT id FROM users").fetchall():
            ensure_note_to_self(db, row["id"])
    purge_expired()

    async def expire_messages():
        while True:
            await asyncio.sleep(1)
            conversations, deleted = purge_expired()
            for cid in conversations:
                with connect() as db:
                    recipients = audience(db, cid)
                await hub.emit(
                    recipients,
                    {"type": "sync", "conversation_id": cid, "deleted_ids": deleted},
                )

    cleanup = asyncio.create_task(expire_messages())
    try:
        yield
    finally:
        cleanup.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup


app = FastAPI(title="Signal Clone API", version="1.0.0", lifespan=lifespan)
origins = [
    s.strip()
    for s in os.getenv(
        "FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


class Login(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    otp: str = Field(min_length=6, max_length=6)


class Register(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=1, max_length=60)
    avatar: str = "💙"
    otp: str = Field(min_length=6, max_length=6)


AVATARS = ["💙", "🌿", "🌸", "🏔️", "☀️", "🎨", "🚀", "🐱", "🌊", "🎧", "🦊", "🌻"]


class Profile(BaseModel):
    display_name: str = Field(min_length=1, max_length=60)
    avatar: str


class ContactInput(BaseModel):
    username: str = Field(min_length=3, max_length=64)


class DirectInput(BaseModel):
    user_id: int


class GroupInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    member_ids: list[int] = Field(min_length=1, max_length=50)


class MemberInput(BaseModel):
    user_id: int


class AttachmentInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    data: str = Field(max_length=13981016)


class ReactionInput(BaseModel):
    emoji: str


class TimerInput(BaseModel):
    seconds: int


class GroupNameInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class RoleInput(BaseModel):
    role: str


class ConversationPreferences(BaseModel):
    pinned: bool | None = None
    muted: bool | None = None
    archived: bool | None = None


class MessageInput(BaseModel):
    body: str = Field(default="", max_length=4000)
    attachment: AttachmentInput | None = None
    client_id: str = Field(min_length=1, max_length=100)
    reply_to: int | None = None


class EditMessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


def get_user(token):
    with connect() as db:
        row = db.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
            (digest(token), now()),
        ).fetchone()
        if not row:
            raise HTTPException(401, "Session expired. Please sign in again.")
        return dict(row)


def current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue.")
    return get_user(authorization[7:])


def member(db, cid, uid, admin=False):
    row = db.execute(
        "SELECT * FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)
    ).fetchone()
    if not row:
        raise HTTPException(403, "You are not a member of this conversation.")
    if admin and row["role"] != "admin":
        raise HTTPException(403, "Only group admins can manage members.")
    return row


def audience(db, cid):
    return [
        r[0]
        for r in db.execute(
            "SELECT user_id FROM members WHERE conversation_id=?", (cid,)
        )
    ]


def public_user(row):
    data = dict(row)
    result = {
        key: data[key]
        for key in ("id", "username", "display_name", "avatar", "last_seen")
    }
    if "role" in data:
        result["role"] = data["role"]
    result["online"] = hub.online(data["id"])
    return result


def audit(db, cid, actor, action, target=None, detail=None):
    db.execute(
        "INSERT INTO audit_logs(actor_id,conversation_id,action,target_user_id,detail,created_at) VALUES (?,?,?,?,?,?)",
        (actor, cid, action, target, detail, now()),
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if (
        request.headers.get("content-length", "0").isdigit()
        and int(request.headers.get("content-length", "0")) > 15_000_000
    ):
        return Response(status_code=413, content="Request too large")
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    return response


@app.get("/health")
def health():
    with connect() as db:
        db.execute("SELECT 1")
    return {"status": "ok"}


def valid_username(value: str) -> str:
    username = value.strip().lower()
    if not re.fullmatch(r"[a-z0-9_+.-]{3,64}", username):
        raise HTTPException(
            422,
            "Use 3–64 letters, numbers, _, ., + or - for your username or phone number.",
        )
    return username


def issue_session(db, user):
    token = secrets.token_urlsafe(32)
    db.execute("DELETE FROM sessions WHERE expires_at<=?", (now(),))
    db.execute(
        "INSERT INTO sessions VALUES (?,?,?)",
        (
            digest(token),
            user["id"],
            (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        ),
    )
    return {"token": token, "user": public_user(user)}


def ensure_note_to_self(db, uid):
    """Keep one personal conversation per account, including migrated accounts."""
    key = f"{uid}:{uid}"
    db.execute(
        "INSERT OR IGNORE INTO conversations(kind,direct_key,created_at) VALUES ('direct',?,?)",
        (key, now()),
    )
    cid = db.execute(
        "SELECT id FROM conversations WHERE direct_key=?", (key,)
    ).fetchone()[0]
    db.execute(
        "INSERT OR IGNORE INTO members(conversation_id,user_id,role) VALUES (?,?,'member')",
        (cid, uid),
    )
    return cid


@app.post("/auth/login")
def login(data: Login, request: Request):
    username = valid_username(data.username)
    rate_limit(f"auth-ip:{request.client.host if request.client else 'unknown'}", 30)
    rate_limit(f"auth-user:{username}", 15)
    if not secrets.compare_digest(data.otp, "123456"):
        raise HTTPException(401, "Incorrect demo verification code.")
    with connect() as db:
        user = db.execute(
            "SELECT * FROM users WHERE username=?", (username,)
        ).fetchone()
        if not user:
            raise HTTPException(401, "Account not found. Create an account first.")
        return issue_session(db, user)


@app.post("/auth/register")
def register(data: Register, request: Request):
    username = valid_username(data.username)
    rate_limit(
        f"register-ip:{request.client.host if request.client else 'unknown'}", 10
    )
    rate_limit(f"register-user:{username}", 5)
    if not secrets.compare_digest(data.otp, "123456"):
        raise HTTPException(401, "Incorrect demo verification code.")
    display = data.display_name.strip()
    if not display or data.avatar not in AVATARS:
        raise HTTPException(422, "Choose a display name and profile avatar.")
    with connect() as db:
        if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise HTTPException(409, "That username is already taken.")
        uid = db.execute(
            "INSERT INTO users(username,display_name,avatar,last_seen) VALUES (?,?,?,?)",
            (username, display, data.avatar, now()),
        ).lastrowid
        # Give newly registered reviewers usable contacts without exposing
        # other real accounts or creating conversations on their behalf.
        db.execute(
            """INSERT OR IGNORE INTO contacts(owner_id,contact_id)
            SELECT ?,id FROM users
            WHERE username IN ('alex','maya','jordan')""",
            (uid,),
        )
        ensure_note_to_self(db, uid)
        user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        return issue_session(db, user)


@app.post("/auth/logout")
async def logout(user=Depends(current_user), authorization: str = Header()):
    token_hash = digest(authorization[7:])
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
    await hub.revoke(user["id"], token_hash)
    return {"ok": True}


@app.get("/me")
def me(user=Depends(current_user)):
    return public_user(user)


@app.patch("/me")
async def profile(data: Profile, user=Depends(current_user)):
    if not data.display_name.strip() or data.avatar not in AVATARS:
        raise HTTPException(422, "Choose a name and one of the profile avatars.")
    with connect() as db:
        db.execute(
            "UPDATE users SET display_name=?,avatar=? WHERE id=?",
            (data.display_name.strip(), data.avatar, user["id"]),
        )
        user = dict(
            db.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
        )
    await hub.emit(list(hub.clients), {"type": "sync"})
    return public_user(user)


@app.get("/contacts")
def contacts(user=Depends(current_user)):
    with connect() as db:
        return [
            public_user(r)
            for r in db.execute(
                "SELECT u.* FROM contacts c JOIN users u ON u.id=c.contact_id WHERE c.owner_id=? ORDER BY u.display_name",
                (user["id"],),
            )
        ]


@app.post("/contacts")
def add_contact(data: ContactInput, user=Depends(current_user)):
    rate_limit(f"contact:{user['id']}", 30)
    with connect() as db:
        contact = db.execute(
            "SELECT * FROM users WHERE username=?", (data.username.strip(),)
        ).fetchone()
        if not contact:
            raise HTTPException(
                404, "No registered user found with that username or phone number."
            )
        if contact["id"] == user["id"]:
            raise HTTPException(422, "Choose another user to add as a contact.")
        db.execute(
            "INSERT OR IGNORE INTO contacts VALUES (?,?)", (user["id"], contact["id"])
        )
        return public_user(contact)


@app.get("/conversations")
def conversations(user=Depends(current_user)):
    result = []
    with connect() as db:
        rows = db.execute(
            "SELECT c.*,m.pinned,m.muted,m.archived FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE m.user_id=?",
            (user["id"],),
        ).fetchall()
        for row in rows:
            item = dict(row)
            item.pop("direct_key")
            for preference in ("pinned", "muted", "archived"):
                item[preference] = bool(item[preference])
            item["members"] = [
                public_user(r)
                for r in db.execute(
                    "SELECT u.*,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? ORDER BY u.display_name",
                    (row["id"],),
                )
            ]
            last = db.execute(
                """SELECT m.*,u.display_name sender_name,a.media_type attachment_type
                FROM messages m JOIN users u ON u.id=m.sender_id
                LEFT JOIN attachments a ON a.message_id=m.id
                WHERE conversation_id=? AND (m.expires_at IS NULL OR m.expires_at>?)
                AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id=m.id AND h.user_id=?)
                ORDER BY m.id DESC LIMIT 1""",
                (row["id"], now(), user["id"]),
            ).fetchone()
            item["last_message"] = dict(last) if last else None
            item["unread"] = db.execute(
                """SELECT count(*) FROM receipts r JOIN messages m ON m.id=r.message_id WHERE m.conversation_id=? AND r.user_id=? AND r.read_at IS NULL AND m.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id=m.id AND h.user_id=?)
                AND (m.expires_at IS NULL OR m.expires_at>?)""",
                (row["id"], user["id"], user["id"], now()),
            ).fetchone()[0]
            result.append(item)
    return sorted(result, key=lambda c: (
        c["pinned"],
        (c["last_message"] or {}).get("created_at", c["created_at"]),
    ), reverse=True)


@app.patch("/conversations/{cid}/preferences")
async def conversation_preferences(
    cid: int, data: ConversationPreferences, user=Depends(current_user)
):
    changes = data.model_dump(exclude_unset=True)
    if not changes or any(value is None for value in changes.values()):
        raise HTTPException(422, "Choose a preference to change.")
    with connect() as db:
        current = member(db, cid, user["id"])
        db.execute(
            """UPDATE members SET pinned=?,muted=?,archived=?
            WHERE conversation_id=? AND user_id=?""",
            (
                int(changes.get("pinned", current["pinned"])),
                int(changes.get("muted", current["muted"])),
                int(changes.get("archived", current["archived"])),
                cid,
                user["id"],
            ),
        )
    await hub.emit([user["id"]], {"type": "sync"})
    return {"ok": True}


@app.post("/conversations/direct")
async def direct(data: DirectInput, user=Depends(current_user)):
    with connect() as db:
        if not db.execute("SELECT 1 FROM users WHERE id=?", (data.user_id,)).fetchone():
            raise HTTPException(404, "User not found.")
        if data.user_id == user["id"]:
            return {"id": ensure_note_to_self(db, user["id"])}
        key = ":".join(map(str, sorted([data.user_id, user["id"]])))
        db.execute(
            "INSERT OR IGNORE INTO conversations(kind,direct_key,created_at) VALUES ('direct',?,?)",
            (key, now()),
        )
        cid = db.execute(
            "SELECT id FROM conversations WHERE direct_key=?", (key,)
        ).fetchone()[0]
        for uid in [data.user_id, user["id"]]:
            db.execute(
                "INSERT OR IGNORE INTO members(conversation_id,user_id,role) VALUES (?,?,?)", (cid, uid, "member")
            )
    await hub.emit([data.user_id, user["id"]], {"type": "sync"})
    return {"id": cid}


@app.post("/conversations/group")
async def group(data: GroupInput, user=Depends(current_user)):
    rate_limit(f"group:{user['id']}", 30)
    if not data.name.strip():
        raise HTTPException(422, "Enter a group name.")
    ids = set(data.member_ids) | {user["id"]}
    if len(ids) < 2:
        raise HTTPException(422, "Add at least one other member.")
    with connect() as db:
        for uid in ids:
            if not db.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                raise HTTPException(404, "A selected user does not exist.")
        cid = db.execute(
            "INSERT INTO conversations(kind,name,created_at) VALUES ('group',?,?)",
            (data.name.strip(), now()),
        ).lastrowid
        for uid in ids:
            db.execute(
                "INSERT INTO members(conversation_id,user_id,role) VALUES (?,?,?)",
                (cid, uid, "admin" if uid == user["id"] else "member"),
            )
        audit(db, cid, user["id"], "group_created", detail=data.name.strip())
    await hub.emit(ids, {"type": "sync"})
    return {"id": cid}


@app.post("/conversations/{cid}/members")
async def add_member(cid: int, data: MemberInput, user=Depends(current_user)):
    rate_limit(f"group:{user['id']}", 30)
    with connect() as db:
        member(db, cid, user["id"], admin=True)
        if (
            db.execute("SELECT kind FROM conversations WHERE id=?", (cid,)).fetchone()[
                0
            ]
            != "group"
        ):
            raise HTTPException(422, "Only groups support member management.")
        if not db.execute("SELECT 1 FROM users WHERE id=?", (data.user_id,)).fetchone():
            raise HTTPException(404, "User not found.")
        if len(audience(db, cid)) >= 51:
            raise HTTPException(422, "This demo supports up to 51 group members.")
        cursor = db.execute(
            "INSERT OR IGNORE INTO members(conversation_id,user_id,role) VALUES (?,?,?)",
            (cid, data.user_id, "member"),
        )
        if cursor.rowcount:
            audit(db, cid, user["id"], "member_added", data.user_id)
        ids = audience(db, cid)
    await hub.emit(ids, {"type": "sync"})
    return {"ok": True}


@app.delete("/conversations/{cid}/members/{uid}")
async def remove_member(cid: int, uid: int, user=Depends(current_user)):
    rate_limit(f"group:{user['id']}", 30)
    with connect() as db:
        member(db, cid, user["id"], admin=True)
        target = member(db, cid, uid)
        if target["role"] == "admin":
            raise HTTPException(422, "The group owner cannot be removed.")
        ids = audience(db, cid)
        db.execute(
            "DELETE FROM members WHERE conversation_id=? AND user_id=?", (cid, uid)
        )
        audit(db, cid, user["id"], "member_removed", uid)
    await hub.emit(ids, {"type": "sync"})
    return {"ok": True}


@app.patch("/conversations/{cid}/name")
async def rename_group(cid: int, data: GroupNameInput, user=Depends(current_user)):
    name = data.name.strip()
    if not name:
        raise HTTPException(422, "Enter a group name.")
    rate_limit(f"group:{user['id']}", 30)
    with connect() as db:
        member(db, cid, user["id"], admin=True)
        row = db.execute(
            "SELECT kind,name FROM conversations WHERE id=?", (cid,)
        ).fetchone()
        if row["kind"] != "group":
            raise HTTPException(422, "Only groups can be renamed.")
        if row["name"] != name:
            db.execute("UPDATE conversations SET name=? WHERE id=?", (name, cid))
            audit(db, cid, user["id"], "group_renamed", detail=name)
        ids = audience(db, cid)
    await hub.emit(ids, {"type": "sync", "conversation_id": cid})
    return {"ok": True}


@app.patch("/conversations/{cid}/members/{uid}/role")
async def set_role(cid: int, uid: int, data: RoleInput, user=Depends(current_user)):
    if data.role not in {"admin", "member"}:
        raise HTTPException(422, "Choose admin or member.")
    rate_limit(f"group:{user['id']}", 30)
    with connect() as db:
        member(db, cid, user["id"], admin=True)
        kind = db.execute(
            "SELECT kind FROM conversations WHERE id=?", (cid,)
        ).fetchone()[0]
        if kind != "group":
            raise HTTPException(422, "Only groups have admins.")
        target = member(db, cid, uid)
        if target["role"] != data.role:
            if (
                target["role"] == "admin"
                and db.execute(
                    "SELECT count(*) FROM members WHERE conversation_id=? AND role='admin'",
                    (cid,),
                ).fetchone()[0]
                <= 1
            ):
                raise HTTPException(422, "A group needs at least one admin.")
            db.execute(
                "UPDATE members SET role=? WHERE conversation_id=? AND user_id=?",
                (data.role, cid, uid),
            )
            audit(
                db,
                cid,
                user["id"],
                "admin_promoted" if data.role == "admin" else "admin_demoted",
                uid,
            )
        ids = audience(db, cid)
    await hub.emit(ids, {"type": "sync", "conversation_id": cid})
    return {"ok": True}


@app.delete("/conversations/{cid}/leave")
async def leave_group(cid: int, user=Depends(current_user)):
    rate_limit(f"group:{user['id']}", 30)
    with connect() as db:
        own = member(db, cid, user["id"])
        kind = db.execute(
            "SELECT kind FROM conversations WHERE id=?", (cid,)
        ).fetchone()[0]
        if kind != "group":
            raise HTTPException(422, "Only groups can be left.")
        if (
            own["role"] == "admin"
            and db.execute(
                "SELECT count(*) FROM members WHERE conversation_id=? AND role='admin'",
                (cid,),
            ).fetchone()[0]
            <= 1
        ):
            raise HTTPException(422, "Promote another admin before leaving.")
        ids = audience(db, cid)
        db.execute(
            "DELETE FROM members WHERE conversation_id=? AND user_id=?",
            (cid, user["id"]),
        )
        audit(db, cid, user["id"], "member_left", user["id"])
    await hub.emit(ids, {"type": "sync", "conversation_id": cid})
    return {"ok": True}


@app.get("/conversations/{cid}/audit")
def group_activity(cid: int, user=Depends(current_user)):
    with connect() as db:
        member(db, cid, user["id"])
        return [
            dict(row)
            for row in db.execute(
                """SELECT a.action,a.detail,a.created_at,actor.display_name actor_name,target.display_name target_name
            FROM audit_logs a JOIN users actor ON actor.id=a.actor_id
            LEFT JOIN users target ON target.id=a.target_user_id
            WHERE a.conversation_id=? ORDER BY a.id DESC LIMIT 20""",
                (cid,),
            )
        ]


@app.get("/conversations/{cid}/messages")
def messages(
    cid: int,
    before: int | None = None,
    limit: int = Query(50, ge=1, le=100),
    user=Depends(current_user),
):
    with connect() as db:
        member(db, cid, user["id"])
        rows = db.execute(
            """SELECT m.*,u.display_name sender_name,u.avatar sender_avatar,
            q.body reply_body,q.expires_at reply_expires_at,qu.display_name reply_sender
            FROM messages m JOIN users u ON u.id=m.sender_id
            LEFT JOIN messages q ON q.id=m.reply_to AND (q.expires_at IS NULL OR q.expires_at > strftime('%Y-%m-%dT%H:%M:%f+00:00','now'))
            AND NOT EXISTS (SELECT 1 FROM hidden_messages hq WHERE hq.message_id=q.id AND hq.user_id=?)
            LEFT JOIN users qu ON qu.id=q.sender_id
            WHERE (m.expires_at IS NULL OR m.expires_at > strftime('%Y-%m-%dT%H:%M:%f+00:00','now')) AND m.conversation_id=? AND (? IS NULL OR m.id<?)
            AND NOT EXISTS (SELECT 1 FROM hidden_messages hm WHERE hm.message_id=m.id AND hm.user_id=?)
            ORDER BY m.id DESC LIMIT ?""",
            (user["id"], cid, before, before, user["id"], limit),
        ).fetchall()
        result = []
        for row in reversed(rows):
            item = dict(row)
            receipts = db.execute(
                "SELECT * FROM receipts WHERE message_id=?", (row["id"],)
            ).fetchall()
            item["status"] = (
                "read"
                if receipts and all(r["read_at"] for r in receipts)
                else "delivered"
                if receipts and all(r["delivered_at"] for r in receipts)
                else "sent"
            )
            attachment = db.execute(
                "SELECT name,media_type,size FROM attachments WHERE message_id=?",
                (row["id"],),
            ).fetchone()
            item["attachment"] = dict(attachment) if attachment else None
            item["reactions"] = [
                dict(r)
                for r in db.execute(
                    "SELECT r.emoji,r.user_id,u.display_name FROM reactions r JOIN users u ON u.id=r.user_id WHERE r.message_id=?",
                    (row["id"],),
                )
            ]
            result.append(item)
        return result


@app.post("/conversations/{cid}/messages")
async def send_message(cid: int, data: MessageInput, user=Depends(current_user)):
    rate_limit(f"message:{user['id']}", 120)
    body = data.body.strip()
    attachment = decode_attachment(data.attachment)
    if not body and not attachment:
        raise HTTPException(422, "Message cannot be empty.")
    if not body:
        body = attachment[0]
    with connect() as db:
        member(db, cid, user["id"])
        prior = db.execute(
            "SELECT id,conversation_id FROM messages WHERE sender_id=? AND client_id=?",
            (user["id"], data.client_id),
        ).fetchone()
        if prior:
            if prior["conversation_id"] != cid:
                raise HTTPException(
                    409, "Client message ID already used in another conversation."
                )
            return {"id": prior["id"]}
        used = db.execute(
            "SELECT message_id FROM message_keys WHERE sender_id=? AND client_id=?",
            (user["id"], data.client_id),
        ).fetchone()
        if used:
            raise HTTPException(
                409, "This message has already disappeared and cannot be retried."
            )
        if (
            data.reply_to
            and not db.execute(
                """SELECT 1 FROM messages WHERE id=? AND conversation_id=? AND deleted_at IS NULL
                AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%f+00:00','now'))
                AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id=messages.id AND h.user_id=?)""",
                (data.reply_to, cid, user["id"]),
            ).fetchone()
        ):
            raise HTTPException(
                422, "Reply must reference a message in this conversation."
            )
        stamp = now()
        mid = db.execute(
            "INSERT INTO messages(id,conversation_id,sender_id,body,created_at,client_id,reply_to) VALUES (?,?,?,?,?,?,?)",
            (
                max(
                    time.time_ns() // 1000,
                    db.execute("SELECT COALESCE(MAX(id),0)+1 FROM messages").fetchone()[
                        0
                    ],
                ),
                cid,
                user["id"],
                body,
                stamp,
                data.client_id,
                data.reply_to,
            ),
        ).lastrowid
        db.execute(
            "INSERT INTO message_keys VALUES (?,?,?)", (user["id"], data.client_id, mid)
        )
        seconds = db.execute(
            "SELECT disappear_seconds FROM conversations WHERE id=?", (cid,)
        ).fetchone()[0]
        if seconds:
            expiry = (
                datetime.fromisoformat(stamp) + timedelta(seconds=seconds)
            ).isoformat()
            db.execute("UPDATE messages SET expires_at=? WHERE id=?", (expiry, mid))
        if attachment:
            db.execute("INSERT INTO attachments VALUES (?,?,?,?,?)", (mid, *attachment))
        ids = audience(db, cid)
        for uid in ids:
            if uid != user["id"]:
                db.execute(
                    "INSERT INTO receipts(message_id,user_id,delivered_at) VALUES (?,?,?)",
                    (mid, uid, stamp if hub.online(uid) else None),
                )
    await hub.emit(
        ids, {"type": "sync", "conversation_id": cid, "sender_id": user["id"]}
    )
    return {"id": mid}


@app.patch("/conversations/{cid}/messages/{mid}")
async def edit_message(
    cid: int, mid: int, data: EditMessageInput, user=Depends(current_user)
):
    body = data.body.strip()
    if not body:
        raise HTTPException(422, "Message cannot be empty.")
    rate_limit(f"message-action:{user['id']}", 60)
    with connect() as db:
        member(db, cid, user["id"])
        row = db.execute(
            "SELECT sender_id,deleted_at FROM messages WHERE id=? AND conversation_id=? AND (expires_at IS NULL OR expires_at>?)",
            (mid, cid, now()),
        ).fetchone()
        if not row or row["deleted_at"]:
            raise HTTPException(404, "Message no longer available.")
        if row["sender_id"] != user["id"]:
            raise HTTPException(403, "You can edit only your own messages.")
        if db.execute(
            "SELECT 1 FROM hidden_messages WHERE message_id=? AND user_id=?",
            (mid, user["id"]),
        ).fetchone():
            raise HTTPException(404, "Message no longer available.")
        if db.execute(
            "SELECT 1 FROM attachments WHERE message_id=?", (mid,)
        ).fetchone():
            raise HTTPException(422, "Attachment messages cannot be edited.")
        db.execute(
            "UPDATE messages SET body=?,edited_at=? WHERE id=?", (body, now(), mid)
        )
        ids = audience(db, cid)
    await hub.emit(ids, {"type": "sync", "conversation_id": cid, "message_id": mid})
    return {"ok": True}


@app.delete("/conversations/{cid}/messages/{mid}")
async def delete_message(
    cid: int,
    mid: int,
    scope: str = Query("me", pattern="^(me|everyone)$"),
    user=Depends(current_user),
):
    rate_limit(f"message-action:{user['id']}", 60)
    with connect() as db:
        member(db, cid, user["id"])
        row = db.execute(
            "SELECT sender_id,deleted_at FROM messages WHERE id=? AND conversation_id=? AND (expires_at IS NULL OR expires_at>?)",
            (mid, cid, now()),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Message no longer available.")
        if scope == "everyone":
            if row["sender_id"] != user["id"]:
                raise HTTPException(
                    403, "You can delete only your own messages for everyone."
                )
            if not row["deleted_at"]:
                db.execute(
                    "UPDATE messages SET body='This message was deleted',deleted_at=? WHERE id=?",
                    (now(), mid),
                )
                db.execute("DELETE FROM attachments WHERE message_id=?", (mid,))
                db.execute("DELETE FROM reactions WHERE message_id=?", (mid,))
                db.execute(
                    "UPDATE receipts SET read_at=COALESCE(read_at,?) WHERE message_id=?",
                    (now(), mid),
                )
            ids = audience(db, cid)
        else:
            db.execute(
                "INSERT OR IGNORE INTO hidden_messages(message_id,user_id) VALUES (?,?)",
                (mid, user["id"]),
            )
            ids = [user["id"]]
    await hub.emit(
        ids,
        {
            "type": "sync",
            "conversation_id": cid,
            **(
                {"message_id": mid, "tombstoned_id": mid}
                if scope == "everyone"
                else {"deleted_ids": [mid]}
            ),
        },
    )
    return {"ok": True}


@app.post("/conversations/{cid}/read")
async def read(cid: int, user=Depends(current_user)):
    with connect() as db:
        member(db, cid, user["id"])
        stamp = now()
        cursor = db.execute(
            "UPDATE receipts SET delivered_at=COALESCE(delivered_at,?),read_at=? WHERE user_id=? AND read_at IS NULL AND message_id IN (SELECT id FROM messages WHERE conversation_id=?)",
            (stamp, stamp, user["id"], cid),
        )
        changed = cursor.rowcount
        ids = audience(db, cid)
    if changed:
        await hub.emit(ids, {"type": "sync", "conversation_id": cid})
    return {"ok": True}


@app.websocket("/ws")
async def websocket(socket: WebSocket):
    if socket.headers.get("origin") not in origins:
        await socket.close(code=1008)
        return
    await socket.accept()
    uid = None
    try:
        raw = await asyncio.wait_for(socket.receive_text(), timeout=10)
        if len(raw) > 2048:
            await socket.close(code=1009)
            return
        auth = json.loads(raw)
        token = auth.get("token", "")
        user = get_user(token)
        uid = user["id"]
        hub.add(uid, socket, digest(token))
        with connect() as db:
            db.execute(
                "UPDATE receipts SET delivered_at=? WHERE user_id=? AND delivered_at IS NULL",
                (now(), uid),
            )
        await hub.emit(list(hub.clients), {"type": "sync"})
        last_typing = 0.0
        while True:
            raw = await asyncio.wait_for(socket.receive_text(), timeout=60)
            if len(raw) > 2048:
                await socket.close(code=1009)
                return
            rate_limit(f"socket:{uid}", 120)
            event = json.loads(raw)
            get_user(token)
            if event.get("type") == "ping":
                await socket.send_json({"type": "pong"})
            elif event.get("type") == "typing" and time.monotonic() - last_typing > 0.5:
                last_typing = time.monotonic()
                cid = event.get("conversation_id")
                with connect() as db:
                    try:
                        member(db, cid, uid)
                    except HTTPException:
                        continue
                    ids = [i for i in audience(db, cid) if i != uid]
                await hub.emit(
                    ids,
                    {
                        "type": "typing",
                        "conversation_id": cid,
                        "user_id": uid,
                        "name": user["display_name"],
                    },
                )
    except (
        WebSocketDisconnect,
        asyncio.TimeoutError,
        HTTPException,
        ValueError,
        TypeError,
        AttributeError,
    ):
        pass
    finally:
        if uid:
            hub.remove(uid, socket)
            with connect() as db:
                db.execute("UPDATE users SET last_seen=? WHERE id=?", (now(), uid))
            await hub.emit(list(hub.clients), {"type": "sync"})
        try:
            await socket.close()
        except RuntimeError:
            pass


@app.patch("/conversations/{cid}/timer")
async def set_timer(cid: int, data: TimerInput, user=Depends(current_user)):
    rate_limit(f"group:{user['id']}", 30)
    if data.seconds not in TIMERS:
        raise HTTPException(422, "Choose one of the available timer durations.")
    with connect() as db:
        member(db, cid, user["id"])
        kind = db.execute(
            "SELECT kind FROM conversations WHERE id=?", (cid,)
        ).fetchone()[0]
        if kind == "group":
            member(db, cid, user["id"], admin=True)
        db.execute(
            "UPDATE conversations SET disappear_seconds=? WHERE id=?",
            (data.seconds, cid),
        )
        if kind == "group":
            audit(db, cid, user["id"], "timer_changed", detail=str(data.seconds))
        ids = audience(db, cid)
    await hub.emit(ids, {"type": "sync", "conversation_id": cid})
    return {"ok": True}


@app.post("/conversations/{cid}/messages/{mid}/reactions")
async def react(cid: int, mid: int, data: ReactionInput, user=Depends(current_user)):
    if data.emoji not in REACTIONS:
        raise HTTPException(422, "Unsupported reaction.")
    with connect() as db:
        member(db, cid, user["id"])
        if not db.execute(
            "SELECT 1 FROM messages WHERE id=? AND conversation_id=? AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at>?) AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id=messages.id AND h.user_id=?)",
            (mid, cid, now(), user["id"]),
        ).fetchone():
            raise HTTPException(404, "Message no longer available.")
        existing = db.execute(
            "SELECT emoji FROM reactions WHERE message_id=? AND user_id=?",
            (mid, user["id"]),
        ).fetchone()
        if existing and existing["emoji"] == data.emoji:
            db.execute(
                "DELETE FROM reactions WHERE message_id=? AND user_id=?",
                (mid, user["id"]),
            )
        else:
            db.execute(
                "INSERT INTO reactions VALUES (?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji",
                (mid, user["id"], data.emoji),
            )
        ids = audience(db, cid)
    await hub.emit(ids, {"type": "sync", "conversation_id": cid, "message_id": mid})
    return {"ok": True}


@app.get("/conversations/{cid}/messages/{mid}/attachment")
def download_attachment(cid: int, mid: int, user=Depends(current_user)):
    with connect() as db:
        member(db, cid, user["id"])
        row = db.execute(
            """SELECT a.* FROM attachments a JOIN messages m ON m.id=a.message_id WHERE m.id=? AND m.conversation_id=? AND m.deleted_at IS NULL
            AND (m.expires_at IS NULL OR m.expires_at>?)
            AND NOT EXISTS (SELECT 1 FROM hidden_messages h WHERE h.message_id=m.id AND h.user_id=?)""",
            (mid, cid, now(), user["id"]),
        ).fetchone()
        if not row:
            raise HTTPException(404, "Attachment no longer available.")
        return Response(
            bytes(row["content"]),
            media_type=row["media_type"],
            headers={
                "Content-Disposition": "attachment; filename*=UTF-8''"
                + quote(row["name"]),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )
