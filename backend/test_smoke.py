import os
os.environ["AUTH_DEV_MODE"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
from fastapi.testclient import TestClient
from app.main import app

A = {"X-Dev-Address": "0xAAA"}
B = {"X-Dev-Address": "0xBBB"}
goal = {"name": "Trip", "amount": 100, "unlock_at": "2027-01-01T00:00:00Z", "task_id": "fh-pushups"}

with TestClient(app) as c:
    assert c.get("/goals").status_code == 401
    r = c.post("/goals", json=goal, headers=A); assert r.status_code == 201, r.text
    gid = r.json()["id"]
    # user_id in payload is ignored; B can't see/modify/delete A's goal
    assert c.get("/goals", headers=B).json() == []
    assert c.get(f"/goals/{gid}", headers=B).status_code == 404
    assert c.patch(f"/goals/{gid}", json={"name": "x"}, headers=B).status_code == 404
    assert c.delete(f"/goals/{gid}", headers=B).status_code == 404
    # partial update, protected fields untouched
    r = c.patch(f"/goals/{gid}", json={"status": "liquidated", "user_id": 99, "id": 5}, headers=A)
    assert r.status_code == 200 and r.json()["status"] == "liquidated" and r.json()["id"] == gid
    # validation
    assert c.post("/goals", json={**goal, "amount": -1}, headers=A).status_code == 422
    # task can't reference another user's goal
    assert c.post("/tasks", json={"task_id": "t", "goal_id": gid}, headers=B).status_code == 400
    assert c.post("/tasks", json={"task_id": "t", "goal_id": gid}, headers=A).status_code == 201
    # rule with json config
    r = c.post("/rules", json={"type": "api", "title": "t", "action": "a", "config": {"url": "x", "n": 1}}, headers=A)
    assert r.status_code == 201 and r.json()["config"]["n"] == 1
    assert c.post("/activities", json={"kind": "swap", "text": "s"}, headers=A).status_code == 201
    assert len(c.get("/activities", headers=A).json()) == 1
    assert c.delete(f"/goals/{gid}", headers=A).status_code == 204
    assert c.get("/me", headers=A).json()["address"] == "0xaaa"
print("ALL OK")
