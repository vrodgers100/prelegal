"""Password hashing and session tokens."""

from prelegal import security


class TestHashPassword:
    def test_a_password_verifies_against_its_own_hash(self):
        stored = security.hash_password("correct horse battery staple")

        assert security.verify_password("correct horse battery staple", stored)

    def test_the_wrong_password_does_not(self):
        stored = security.hash_password("correct horse battery staple")

        assert not security.verify_password("Correct horse battery staple", stored)

    def test_the_password_is_not_recoverable_from_the_hash(self):
        assert "hunter2" not in security.hash_password("hunter2")

    def test_the_same_password_hashes_differently_every_time(self):
        """Salted, so a repeated password is not a repeated hash."""
        first = security.hash_password("hunter2")
        second = security.hash_password("hunter2")

        assert first != second
        assert security.verify_password("hunter2", first)
        assert security.verify_password("hunter2", second)

    def test_a_long_unicode_password_survives_the_round_trip(self):
        password = "correct☕horse🐴battery🔋staple" * 4

        assert security.verify_password(password, security.hash_password(password))


class TestVerifyPassword:
    """A stored value that is not a hash is a failure, never an exception."""

    def test_rejects_a_stored_value_with_no_separator(self):
        assert not security.verify_password("hunter2", "nonsense")

    def test_rejects_a_stored_value_that_is_not_hex(self):
        assert not security.verify_password("hunter2", "zz$zz")

    def test_rejects_an_empty_stored_value(self):
        assert not security.verify_password("hunter2", "")

    def test_rejects_an_empty_digest(self):
        assert not security.verify_password("hunter2", "abcd$")


class TestGenerateToken:
    def test_tokens_are_unique(self):
        assert len({security.generate_token() for _ in range(100)}) == 100

    def test_tokens_are_long_enough_to_be_unguessable(self):
        assert len(security.generate_token()) >= 32

    def test_tokens_survive_a_header_unencoded(self):
        """token_urlsafe keeps to characters a Bearer header carries as-is."""
        token = security.generate_token()

        assert token.isascii()
        assert " " not in token
