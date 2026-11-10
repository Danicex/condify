"""
Quick API smoke test (no chain, no AI): run from the backend folder with `python test_smoke.py`.
Uses the dev-header login (AUTH_DEV_MODE=1). Chain + AI + wallet-signature login are covered by the end-to-end flow
described in the README.
"""
import os
os.environ["AUTH_DEV_MODE"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret")
if os.path.exists("test.db"):
    os.remove("test.db")
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from app.main import app

A = {"X-Dev-Address": "0x" + "a" * 40}
B = {"X-Dev-Address": "0x" + "b" * 40}
future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
goal = {"name": "Trip", "amount": 100, "unlock_at": future, "task_category": "fitness_health", "task_difficulty": "easy"}

with TestClient(app) as c:
    assert c.get("/goals").status_code == 401
    assert c.get("/goals", headers={"Authorization": "Bearer nope"}).status_code == 401
    r = c.post("/goals", json={**goal, "status": "active", "user_id": 99, "amount_raw": "1"}, headers=A); assert r.status_code == 201, r.text
    gid = r.json()["id"]
    assert r.json()["status"] == "pending"  # the client cannot pick the status
    # B can't see / touch A's goal
    assert c.get("/goals", headers=B).json() == []
    assert c.get(f"/goals/{gid}", headers=B).status_code == 404
    assert c.delete(f"/goals/{gid}", headers=B).status_code == 404
    assert c.post(f"/goals/{gid}/task", headers=B).status_code == 404
    # no generic PATCH on goals any more, and an unconfirmed goal needs the chain (not configured here)
    assert c.patch(f"/goals/{gid}", json={"status": "liquidated"}, headers=A).status_code in (404, 405)
    assert c.post(f"/goals/{gid}/confirm", json={}, headers=A).status_code == 503
    # validation
    assert c.post("/goals", json={**goal, "amount": -1}, headers=A).status_code == 422
    assert c.post("/goals", json={**goal, "task_category": "nope"}, headers=A).status_code == 422
    assert c.post("/goals", json={**goal, "unlock_at": "2020-01-01T00:00:00Z"}, headers=A).status_code == 422
    assert c.post("/goals", json={**goal, "token": "NIM"}, headers=A).status_code == 422
    # no task without a confirmed lock
    assert c.post(f"/goals/{gid}/task", headers=A).status_code == 409
    # clients can't create tasks / completions
    assert c.post("/tasks", json={"task_id": "x"}, headers=A).status_code == 405
    assert c.get("/tasks", headers=A).json() == []
    # rules / activity
    r = c.post("/rules", json={"type": "api", "title": "t", "action": "a", "config": {"url": "x", "n": 1}}, headers=A)
    assert r.status_code == 201 and r.json()["config"]["n"] == 1
    assert c.post("/activities", json={"kind": "swap", "text": "s"}, headers=A).status_code == 201
    assert len(c.get("/activities", headers=A).json()) == 1
    # an unconfirmed goal can be deleted (e.g. the user rejected the lock transaction)
    assert c.delete(f"/goals/{gid}", headers=A).status_code == 204
    assert c.get("/me", headers=A).json()["address"] == "0x" + "a" * 40
print("ALL OK")
