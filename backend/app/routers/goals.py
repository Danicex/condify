"""
Goals. The money lives in the lock contract under (owner address, goal id = this row's id), so the order matters:

  1. POST /goals                  creates the row as `pending` and returns its id
  2. wallet: lock(goalId, amount, unlockAt) on the contract   (user signs, user pays gas)
  3. POST /goals/{id}/confirm     the BACKEND READS THE CONTRACT; if the lock is really there the goal becomes `active`
                                  and amount / unlock time are copied from the chain, never trusted from the client
  4a. lock period over: the user calls withdraw() on the contract, then POST /goals/{id}/sync marks it `liquidated`
  4b. early: pass the task (routers/tasks.py), the backend relays the key to the contract and marks it `liquidated`.
      POST /goals/{id}/release retries that relay if it failed.

The client can never set status, amounts or tx hashes directly: the generic PATCH is gone.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, StringConstraints
from sqlmodel import func, select

from app import chain, crud, task_ai
from app.database import SessionDep
from app.deps import CurrentUser
from app.errors import ApiError
from app.model import ActivityCreate, Goal, GoalCreate, GoalRead, utcnow

router = APIRouter(prefix="/goals", tags=["goal"])

TOKEN_DECIMALS = {"USDT": 6}
MAX_PENDING = 10  # unconfirmed goals per user (a failed lock leaves one behind until it is deleted or confirmed)
TxHash = Annotated[str, StringConstraints(pattern=r"^0x[0-9a-fA-F]{64}$")]


class ConfirmBody(BaseModel):
    tx_hash: Optional[TxHash] = None


class ReleaseOut(BaseModel):
    released: bool
    tx_hash: Optional[str] = None
    error: Optional[str] = None
    goal: GoalRead


def _own_goal(goal_id: int, session: SessionDep, user_id: int) -> Goal:
    goal = crud.get_data("goal", goal_id, session, user_id)
    if not goal:
        raise HTTPException(404, "goal not found")
    return goal


def _log(session: SessionDep, user_id: int, kind: str, text: str, tx_hash: Optional[str] = None) -> None:
    crud.create_data("activity", ActivityCreate(kind=kind, text=text, tx_hash=tx_hash), session, user_id)


@router.get("", response_model=list[GoalRead])
def list_goals(session: SessionDep, user: CurrentUser, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0)):
    return crud.read_data("goal", session, user.id, limit=limit, offset=offset)


@router.get("/{goal_id}", response_model=GoalRead)
def get_goal(goal_id: int, session: SessionDep, user: CurrentUser):
    return _own_goal(goal_id, session, user.id)


@router.post("", response_model=GoalRead, status_code=201)
def create_goal(body: GoalCreate, session: SessionDep, user: CurrentUser):
    if body.token not in TOKEN_DECIMALS:
        raise HTTPException(422, "only USDT goals are supported")
    if body.unlock_at <= utcnow():
        raise HTTPException(422, "unlock_at must be in the future")
    pending = session.exec(select(func.count()).select_from(Goal).where(Goal.user_id == user.id, Goal.status == "pending")).one()
    if pending >= MAX_PENDING:
        raise HTTPException(429, "too many unconfirmed goals, finish or delete them first")
    ok, goal = crud.create_data("goal", body, session, user.id)  # status defaults to "pending"
    if not ok:
        raise HTTPException(400, "could not create goal")
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete_goal(goal_id: int, session: SessionDep, user: CurrentUser):
    """Only an unconfirmed goal can be deleted (e.g. the user rejected the lock transaction). Locked goals are permanent records."""
    goal = _own_goal(goal_id, session, user.id)
    if goal.status != "pending":
        raise HTTPException(409, "only unconfirmed goals can be deleted")
    crud.delete_data("goal", goal_id, session, user.id)
    return Response(status_code=204)


@router.post("/{goal_id}/confirm", response_model=GoalRead)
def confirm_goal(goal_id: int, session: SessionDep, user: CurrentUser, body: ConfirmBody = ConfirmBody()):
    """Backend reads the contract. Idempotent: confirming an already confirmed goal just returns it."""
    goal = _own_goal(goal_id, session, user.id)
    if goal.status != "pending":
        return goal
    state = chain.get_goal(user.address, goal.id)
    if state["amount"] == 0:
        raise ApiError(409, "no lock found on-chain for this goal yet. If your transaction is still pending, try again in a moment.")

    goal.amount_raw = str(state["amount"])
    goal.amount = state["amount"] / 10 ** TOKEN_DECIMALS[goal.token]
    goal.unlock_at = datetime.fromtimestamp(state["unlock_at"], tz=timezone.utc)
    goal.status = "liquidated" if state["released"] else "active"
    if body.tx_hash:
        goal.tx_hash = body.tx_hash
    session.add(goal)
    session.commit()
    session.refresh(goal)
    _log(session, user.id, "lock", f"Locked ${goal.amount:,.2f} into {goal.name}", goal.tx_hash)
    return goal


@router.post("/{goal_id}/sync", response_model=GoalRead)
def sync_goal(goal_id: int, session: SessionDep, user: CurrentUser):
    """After the user's own withdraw(): read the contract and mark the goal liquidated if it was released."""
    goal = _own_goal(goal_id, session, user.id)
    if goal.status != "active":
        return goal
    state = chain.get_goal(user.address, goal.id)
    if state["released"]:
        goal.status = "liquidated"
        goal.liquidated_at = utcnow()
        session.add(goal)
        session.commit()
        session.refresh(goal)
        _log(session, user.id, "unlock", f"Withdrew {goal.name} · ${goal.amount:,.2f} released")
    return goal


@router.post("/{goal_id}/release", response_model=ReleaseOut)
def release_goal(goal_id: int, session: SessionDep, user: CurrentUser):
    """Retry the backend -> contract release for a goal whose task was passed (e.g. the first relay failed). Idempotent."""
    _own_goal(goal_id, session, user.id)
    result = task_ai.release_goal(goal_id, session, user.id)
    goal = _own_goal(goal_id, session, user.id)
    return ReleaseOut(**result, goal=GoalRead.model_validate(goal, from_attributes=True))


@router.get("/{goal_id}/unlock-key")
def unlock_key(goal_id: int, session: SessionDep, user: CurrentUser):
    """
    The signed task key for a goal whose task was passed (403 otherwise). Normally the backend relays it itself; this is
    the fallback so the user can submit it from their own wallet (unlockWithKey) if the relayer is down or out of gas.
    The key only ever releases to the goal's owner, so exposing it to that owner is safe.
    """
    _own_goal(goal_id, session, user.id)
    return task_ai.get_unlock_key(goal_id, session, user.id)
