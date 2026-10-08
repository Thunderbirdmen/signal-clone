"""Attachment validation and durable disappearing-message cleanup."""

import base64
import binascii
from datetime import datetime, timezone
from fastapi import HTTPException
from .db import connect

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥"]
TIMERS = [0, 10, 60, 3600, 86400, 604800]


def decode_attachment(attachment):
    if attachment is None:
        return None
    try:
        content = base64.b64decode(attachment.data, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "Invalid attachment encoding.")
    if not content or len(content) > MAX_ATTACHMENT_BYTES:
        raise HTTPException(413, "Choose a non-empty file up to 10 MB.")
    name = attachment.name.replace("\\", "/").split("/")[-1]
    name = "".join(c for c in name if c.isprintable()).strip()
    if not name:
        raise HTTPException(422, "A filename is required.")
    # Only recognized raster formats render inline. All other bytes download.
    mime = "application/octet-stream"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif content.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif content.startswith((b"GIF87a", b"GIF89a")):
        mime = "image/gif"
    elif content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        mime = "image/webp"
    return name, mime, len(content), content


def purge_expired():
    """Delete messages, attachments and reactions; remove surviving quoted references."""
    with connect() as db:
        rows = db.execute(
            "SELECT id,conversation_id FROM messages WHERE expires_at<=?",
            (datetime.now(timezone.utc).isoformat(),),
        ).fetchall()
        ids = [r["id"] for r in rows]
        for mid in ids:
            db.execute("UPDATE messages SET reply_to=NULL WHERE reply_to=?", (mid,))
            db.execute("DELETE FROM messages WHERE id=?", (mid,))
        return {r["conversation_id"] for r in rows}, ids
