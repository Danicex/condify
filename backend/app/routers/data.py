from fastapi import APIRouter, HTTPException, Query, Response

from app import crud
from app.deps import CurrentUser
from app.database import SessionDep
from app.model import (
    ActivityCreate, ActivityRead, ActivityUpdate,
    RuleCreate, RuleRead, RuleUpdate,
)


def make_router(obj_name: str, plural: str, Create, Update, Read) -> APIRouter:
    """Builds list / get / create / patch / delete routes for one resource, all via app.crud helpers."""
    router = APIRouter(prefix=f"/{plural}", tags=[obj_name])

    @router.get("", response_model=list[Read])
    def list_items(session: SessionDep, user: CurrentUser, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
        return crud.read_data(obj_name, session, user.id, limit=limit, offset=offset)

    @router.get("/{item_id}", response_model=Read)
    def get_item(item_id: int, session: SessionDep, user: CurrentUser):
        item = crud.get_data(obj_name, item_id, session, user.id)
        if not item:
            raise HTTPException(404, f"{obj_name} not found")
        return item

    @router.post("", response_model=Read, status_code=201)
    def create_item(body: Create, session: SessionDep, user: CurrentUser):
        ok, item = crud.create_data(obj_name, body, session, user.id)
        if not ok:
            raise HTTPException(400, "Could not create (invalid reference)")
        return item

    @router.patch("/{item_id}", response_model=Read)
    def update_item(item_id: int, body: Update, session: SessionDep, user: CurrentUser):
        ok, item = crud.update_data(obj_name, item_id, body, session, user.id)
        if not ok:
            raise HTTPException(404, f"{obj_name} not found")
        return item

    @router.delete("/{item_id}", status_code=204)
    def delete_item(item_id: int, session: SessionDep, user: CurrentUser):
        if not crud.delete_data(obj_name, item_id, session, user.id):
            raise HTTPException(404, f"{obj_name} not found")
        return Response(status_code=204)

    return router


# Goals and tasks are NOT generic CRUD: they mirror on-chain state and AI grading, so they have their own routers
# (routers/goals.py, routers/tasks.py) where the server, not the client, decides status, amounts and results.
routers = [
    make_router("rule", "rules", RuleCreate, RuleUpdate, RuleRead),
    make_router("activity", "activities", ActivityCreate, ActivityUpdate, ActivityRead),
]
