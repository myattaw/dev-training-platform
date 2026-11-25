"""Salted PBKDF2 password hashes. Store the hash, never the password."""
import base64
import hashlib
import secrets

ITERATIONS = 10_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    b64 = lambda data: base64.b64encode(data).decode("ascii")  # noqa: E731
    return f"pbkdf2-sha256${ITERATIONS}${b64(salt)}${b64(digest)}"
