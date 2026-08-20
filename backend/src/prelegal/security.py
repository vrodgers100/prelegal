"""Password hashing and session tokens.

Pure functions with no database and no framework, so the parts that are easy to
get wrong can be tested on their own.

`hashlib.scrypt` rather than a hashing library: it is in the standard library,
it is memory-hard, and it costs this project no dependency. The parameters
below are the interactive-login set from the scrypt paper, which measured at
roughly 60ms per hash here — slow enough to be worth an attacker's while to
avoid, fast enough that signing in feels instant.
"""

import hashlib
import hmac
import os
import secrets

#: Cost parameters. `n` is the work factor; raising it raises both the time and
#: the memory an attacker needs per guess. Stored hashes do not record these,
#: so changing them invalidates every existing password — which costs nothing
#: while the database is dropped on every boot, and would need a version marker
#: in the stored string if it ever stopped being.
_N = 2**14
_R = 8
_P = 1
_SALT_BYTES = 16
_KEY_BYTES = 32


def hash_password(password: str) -> str:
    """Returns a salted hash, as `salt$digest` in hex.

    A fresh salt per password, so two people choosing the same one do not end
    up with the same hash.
    """
    salt = os.urandom(_SALT_BYTES)
    return f"{salt.hex()}${_derive(password, salt).hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Whether `password` is the one `stored` was made from.

    Compared with `hmac.compare_digest` so the time taken does not depend on
    how much of the hash matched. A malformed stored value is a failure rather
    than an error: there is no password that could be right for it.
    """
    salt_hex, _, digest_hex = stored.partition("$")
    try:
        salt, digest = bytes.fromhex(salt_hex), bytes.fromhex(digest_hex)
    except ValueError:
        return False
    if not salt or not digest:
        return False
    return hmac.compare_digest(_derive(password, salt), digest)


def generate_token() -> str:
    """A new session token, unguessable and safe in a header."""
    return secrets.token_urlsafe(32)


def _derive(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(
        password.encode("utf8"), salt=salt, n=_N, r=_R, p=_P, dklen=_KEY_BYTES
    )
