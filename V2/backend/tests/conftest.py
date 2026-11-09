import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import config  # noqa: E402
from app.main import app  # noqa: E402


class Clock:
    def set(self, iso: str):
        config.NOW_OVERRIDE = iso


@pytest.fixture()
def clock(monkeypatch):
    monkeypatch.setattr(config, "NOW_OVERRIDE", "2026-11-10T08:00:00")
    c = Clock()
    yield c


@pytest.fixture()
def client(tmp_path, monkeypatch, clock):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def patient(client):
    """A new patient enrolled a week ago with the sleep and physical activity domains on."""
    r = client.post("/patients", json={"first_name": "Test", "last_name": "Patient", "enrolled_on": "2026-11-01",
                                       "domains": ["sleep", "physical_activity"]})
    assert r.status_code == 201
    return r.json()["patient_id"]


@pytest.fixture()
def plain(client):
    """A patient with only General switched on (easy to calculate by hand)."""
    r = client.post("/patients", json={"first_name": "Plain", "last_name": "Patient", "enrolled_on": "2026-11-01"})
    return r.json()["patient_id"]
