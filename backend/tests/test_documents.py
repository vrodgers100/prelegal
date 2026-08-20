"""Saved documents, and the privacy of them."""

import pytest

NDA = {"documentType": "mutual-nda"}


def start(client, headers, **overrides):
    return client.post("/api/documents", json={**NDA, **overrides}, headers=headers)


def save(client, headers, document_id, fields):
    return client.put(
        f"/api/documents/{document_id}/fields", json={"fields": fields}, headers=headers
    )


class TestStart:
    def test_starts_an_empty_document(self, client, auth_headers):
        response = start(client, auth_headers)

        assert response.status_code == 201
        body = response.json()
        assert body["documentType"] == "mutual-nda"
        assert body["fields"] == {}
        assert body["id"]

    def test_refuses_an_agreement_prelegal_does_not_draft(self, client, auth_headers):
        response = start(client, auth_headers, documentType="employment-contract")

        assert response.status_code == 422
        assert "does not draft" in response.json()["detail"]

    def test_needs_a_signed_in_user(self, client):
        assert client.post("/api/documents", json=NDA).status_code == 401


class TestSave:
    def test_stores_the_fields(self, client, auth_headers):
        document_id = start(client, auth_headers).json()["id"]

        response = save(
            client, auth_headers, document_id, {"governingLaw": "Delaware"}
        )

        assert response.status_code == 200
        assert response.json()["fields"]["governingLaw"] == "Delaware"

    def test_replaces_rather_than_merges(self, client, auth_headers):
        """The browser owns the document; a merge here would be a second opinion."""
        document_id = start(client, auth_headers).json()["id"]
        save(client, auth_headers, document_id, {"governingLaw": "Delaware"})

        response = save(client, auth_headers, document_id, {"purpose": "A merger."})

        assert "governingLaw" not in response.json()["fields"]
        assert response.json()["fields"]["purpose"] == "A merger."

    def test_keeps_a_party(self, client, auth_headers):
        document_id = start(client, auth_headers).json()["id"]

        response = save(
            client,
            auth_headers,
            document_id,
            {"partyOne": {"company": "Acme, Inc.", "signatoryName": "Ada Lovelace"}},
        )

        party = response.json()["fields"]["partyOne"]
        assert party["company"] == "Acme, Inc."
        assert party["signatoryName"] == "Ada Lovelace"

    def test_refuses_fields_the_agreement_does_not_have(self, client, auth_headers):
        """The same validation the drafting conversation uses."""
        document_id = start(client, auth_headers).json()["id"]

        response = save(client, auth_headers, document_id, {"governingLaw": 42})

        assert response.status_code == 422
        assert "not valid" in response.json()["detail"]

    def test_moves_the_document_to_the_top_of_the_list(self, client, auth_headers):
        older = start(client, auth_headers).json()["id"]
        newer = start(client, auth_headers).json()["id"]

        save(client, auth_headers, older, {"governingLaw": "Delaware"})

        listed = client.get("/api/documents", headers=auth_headers).json()
        assert [item["id"] for item in listed] == [older, newer]

    def test_needs_a_signed_in_user(self, client, auth_headers):
        document_id = start(client, auth_headers).json()["id"]

        response = client.put(
            f"/api/documents/{document_id}/fields", json={"fields": {}}
        )

        assert response.status_code == 401


class TestIndex:
    def test_is_empty_for_a_new_user(self, client, auth_headers):
        response = client.get("/api/documents", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == []

    def test_lists_most_recently_worked_on_first(self, client, auth_headers):
        first = start(client, auth_headers).json()["id"]
        second = start(client, auth_headers).json()["id"]

        listed = client.get("/api/documents", headers=auth_headers).json()

        assert [item["id"] for item in listed] == [second, first]

    def test_leaves_the_contents_out(self, client, auth_headers):
        """The list needs a name and a date, not every field of every document."""
        document_id = start(client, auth_headers).json()["id"]
        save(client, auth_headers, document_id, {"governingLaw": "Delaware"})

        listed = client.get("/api/documents", headers=auth_headers).json()

        assert "fields" not in listed[0]
        assert listed[0]["documentType"] == "mutual-nda"
        assert listed[0]["updatedAt"]


class TestShow:
    def test_reads_a_document_back(self, client, auth_headers):
        document_id = start(client, auth_headers).json()["id"]
        save(client, auth_headers, document_id, {"governingLaw": "Delaware"})

        response = client.get(f"/api/documents/{document_id}", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["fields"] == {"governingLaw": "Delaware"}

    def test_is_not_found_when_there_is_no_such_document(self, client, auth_headers):
        assert client.get("/api/documents/999", headers=auth_headers).status_code == 404


class TestPrivacy:
    """One user's documents are invisible to another."""

    @pytest.fixture
    def theirs(self, client, register):
        """A document belonging to somebody else."""
        headers = register("grace@example.com")
        return start(client, headers).json()["id"]

    def test_another_users_document_is_not_in_my_list(
        self, client, auth_headers, theirs
    ):
        assert client.get("/api/documents", headers=auth_headers).json() == []

    def test_i_cannot_read_another_users_document(self, client, auth_headers, theirs):
        response = client.get(f"/api/documents/{theirs}", headers=auth_headers)

        assert response.status_code == 404

    def test_i_cannot_write_to_another_users_document(self, client, auth_headers, theirs):
        response = save(client, auth_headers, theirs, {"governingLaw": "Delaware"})

        assert response.status_code == 404

    def test_reading_someone_elses_looks_exactly_like_reading_a_missing_one(
        self, client, auth_headers, theirs
    ):
        """A 403 would confirm the id is real. A 404 tells them nothing."""
        real = client.get(f"/api/documents/{theirs}", headers=auth_headers)
        imaginary = client.get("/api/documents/999999", headers=auth_headers)

        assert real.status_code == imaginary.status_code == 404
        assert real.json() == imaginary.json()

    def test_their_document_survives_my_attempt_on_it(self, client, auth_headers, theirs, register):
        save(client, auth_headers, theirs, {"governingLaw": "Delaware"})

        mine = client.get("/api/documents", headers=auth_headers).json()
        assert mine == []
