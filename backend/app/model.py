"""
SQLModel schema. Every table except `User` carries a `user_id` foreign key: each row belongs to exactly one user.

Per resource we have:
  <X>Base    shared client-editable fields
  <X>        the table (adds id, user_id, server-set fields)
  <X>Create  request body for POST   (never contains user_id: it comes from the auth'd user)
  <X>Update  request body for PATCH  (all optional)
  <X>Read    response body
"""
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from pydantic import AwareDatetime, StringConstraints

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


# string enums, validated on request bodies (pydantic constraints work across SQLModel versions)
Token = Annotated[str, StringConstraints(pattern=r"^(USDT|NIM)$")]
GoalStatus = Annotated[str, StringConstraints(pattern=r"^(active|liquidated)$")]
RuleType = Annotated[str, StringConstraints(pattern=r"^(time|api|location)$")]
ActivityKind = Annotated[str, StringConstraints(pattern=r"^(lock|unlock|swap|send|task|rule)$")]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ───────────────────────────── User ─────────────────────────────
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    address: str = Field(index=True, unique=True)  # lowercase 0x… EVM address (wallet identity)
    nim_address: Optional[str] = None  # Nimiq account, optional
    created_at: datetime = Field(default_factory=utcnow)


class UserRead(SQLModel):
    id: int
    address: str
    nim_address: Optional[str] = None
    created_at: datetime


# ───────────────────────────── Goal ─────────────────────────────
# Metadata for a USDT lock. The funds themselves live in the lock contract; `tx_hash` links to the lock tx.
class GoalBase(SQLModel):
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0)
    token: Token = "USDT"
    unlock_at: AwareDatetime  # must carry a timezone, e.g. new Date().toISOString()
    task_id: str  # id from the frontend's data/task.js
    status: GoalStatus = "active"
    tx_hash: Optional[str] = None


class Goal(GoalBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    liquidated_at: Optional[datetime] = None


class GoalCreate(GoalBase):
    pass


class GoalUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    unlock_at: Optional[AwareDatetime] = None
    task_id: Optional[str] = None
    status: Optional[GoalStatus] = None
    tx_hash: Optional[str] = None
    liquidated_at: Optional[AwareDatetime] = None


class GoalRead(GoalBase):
    id: int
    created_at: datetime
    liquidated_at: Optional[datetime] = None


# ───────────────────────────── Rule (Automate) ─────────────────────────────
class RuleBase(SQLModel):
    type: RuleType  # When / What / Where
    title: str
    detail: str = ""
    action: str  # human text, e.g. "Swap 50 USDT → NIM"
    enabled: bool = True


class Rule(RuleBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))  # trigger + action params
    created_at: datetime = Field(default_factory=utcnow)
    last_triggered_at: Optional[datetime] = None


class RuleCreate(RuleBase):
    config: dict[str, Any] = Field(default_factory=dict)


class RuleUpdate(SQLModel):
    title: Optional[str] = None
    detail: Optional[str] = None
    action: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[dict[str, Any]] = None


class RuleRead(RuleBase):
    id: int
    config: dict[str, Any]
    created_at: datetime
    last_triggered_at: Optional[datetime] = None


# ───────────────────────────── Activity ─────────────────────────────
# Feed shown on the dashboard: lock / unlock / swap / send / task / rule.
class ActivityBase(SQLModel):
    kind: ActivityKind
    text: str
    tx_hash: Optional[str] = None


class Activity(ActivityBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)


class ActivityCreate(ActivityBase):
    pass


class ActivityUpdate(SQLModel):
    text: Optional[str] = None
    tx_hash: Optional[str] = None


class ActivityRead(ActivityBase):
    id: int
    created_at: datetime


# ───────────────────────────── Task (provisional) ─────────────────────────────
# Task *definitions* stay in the frontend (data/task.js). This table only records that a user completed one.
# Kept deliberately small until the task design is settled.
class TaskBase(SQLModel):
    task_id: str
    goal_id: Optional[int] = Field(default=None, foreign_key="goal.id", index=True)
    score: Optional[float] = None


class Task(TaskBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    completed_at: datetime = Field(default_factory=utcnow)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(SQLModel):
    score: Optional[float] = None


class TaskRead(TaskBase):
    id: int
    completed_at: datetime
