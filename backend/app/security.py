"""Small demo security controls; one process, so counters are process-local."""
import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException

# PBKDF2 stores a fresh random salt with each password. Never store plaintext.
ROUNDS = 310_000
_counters: dict[str, deque[float]] = defaultdict(deque)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ROUNDS)
    return f'pbkdf2_sha256${ROUNDS}${salt.hex()}${key.hex()}'


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt, expected = encoded.split('$')
        if algorithm != 'pbkdf2_sha256' or int(rounds) != ROUNDS:
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ROUNDS)
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def demo_enabled() -> bool:
    return os.getenv('ENABLE_DEMO_LOGIN', 'true').lower() == 'true'


def rate_limit(key: str, max_count: int, window_seconds: int = 60) -> None:
    """Bound a user/IP operation; call before database work. Add Redis at scale."""
    current = time.monotonic()
    events = _counters[key]
    while events and events[0] <= current - window_seconds:
        events.popleft()
    if len(events) >= max_count:
        raise HTTPException(429, 'Too many requests. Please try again shortly.')
    events.append(current)


def reset_limits() -> None:
    _counters.clear()
