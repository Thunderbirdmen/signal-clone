"""One-process websocket fan-out; SQLite remains the source of truth."""

from fastapi import WebSocket


class Hub:
    def __init__(self):
        self.clients: dict[int, dict[WebSocket, str]] = {}

    def add(self, uid, socket, token_hash):
        self.clients.setdefault(uid, {})[socket] = token_hash

    def remove(self, uid, socket):
        self.clients.get(uid, {}).pop(socket, None)
        if not self.clients.get(uid):
            self.clients.pop(uid, None)

    def online(self, uid):
        return bool(self.clients.get(uid))

    async def emit(self, user_ids, event):
        for uid in set(user_ids):
            for socket in list(self.clients.get(uid, {})):
                try:
                    await socket.send_json(event)
                except Exception:
                    self.remove(uid, socket)

    async def revoke(self, uid, token_hash):
        for socket, token in list(self.clients.get(uid, {}).items()):
            if token == token_hash:
                self.remove(uid, socket)
                await socket.close(code=4001)


hub = Hub()
