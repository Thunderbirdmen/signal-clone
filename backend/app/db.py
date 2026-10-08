"""SQLite schema and short-lived, foreign-key-enforced transactions."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = os.getenv(
    "DATABASE_PATH", str(Path(__file__).resolve().parents[1] / "data" / "signal.db")
)
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '💙', last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
 owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(owner_id,contact_id), CHECK(owner_id != contact_id)
);
CREATE TABLE IF NOT EXISTS conversations (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('direct','group')),
 name TEXT, direct_key TEXT UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
 conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
 PRIMARY KEY(conversation_id,user_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 sender_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL, client_id TEXT NOT NULL,
 reply_to INTEGER REFERENCES messages(id), UNIQUE(sender_id,client_id)
);
CREATE TABLE IF NOT EXISTS receipts (
 message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id), delivered_at TEXT, read_at TEXT,
 PRIMARY KEY(message_id,user_id)
);
CREATE TABLE IF NOT EXISTS message_keys (
 sender_id INTEGER NOT NULL REFERENCES users(id), client_id TEXT NOT NULL,
 message_id INTEGER NOT NULL, PRIMARY KEY(sender_id,client_id)
);
CREATE TABLE IF NOT EXISTS hidden_messages (
 message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(message_id,user_id)
);
CREATE TABLE IF NOT EXISTS attachments (
 message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
 name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, content BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS reactions (
 message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES users(id), emoji TEXT NOT NULL,
 PRIMARY KEY(message_id,user_id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY, actor_id INTEGER NOT NULL REFERENCES users(id),
 conversation_id INTEGER NOT NULL REFERENCES conversations(id),
 action TEXT NOT NULL, target_user_id INTEGER REFERENCES users(id),
 detail TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_conversation ON audit_logs(conversation_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(user_id,read_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id,conversation_id);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        # Additive migrations preserve databases created by the first release.
        for table, column, declaration in [
            ("users", "password_hash", "TEXT"),
            ("conversations", "disappear_seconds", "INTEGER NOT NULL DEFAULT 0"),
            ("messages", "expires_at", "TEXT"),
            ("messages", "deleted_at", "TEXT"),
            ("messages", "edited_at", "TEXT"),
        ]:
            columns = {
                row["name"] for row in conn.execute(f"PRAGMA table_info({table})")
            }
            if column not in columns:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_expiry ON messages(expires_at)"
        )
        conn.execute(
            "INSERT OR IGNORE INTO message_keys SELECT sender_id,client_id,id FROM messages"
        )
        conn.execute(
            "UPDATE members SET role='member' WHERE conversation_id IN (SELECT id FROM conversations WHERE kind='direct') AND role!='member'"
        )
