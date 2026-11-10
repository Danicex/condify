"""
SQLModel schema. Every table except `User` and `AuthNonce` carries a `user_id` foreign key: each row belongs to exactly one user.

Per resource we have:
  <X>Base    shared client-editable fields
  <X>        the table (adds id, user_id, server-set fields)
  <X>Create  request body for POST   (never contains user_id: it comes from the auth'd user)
  <X>Update  request body for PATCH  (all optional)
  <X>Read    response body

Money lives on-chain (USDTlock). Rows here are metadata. Fields that mirror the chain (status, amount_raw, tx hashes) are
only ever written by the server after it has read the contract, never taken from a request body.
"""
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from pydantic import AwareDatetime, StringConstraints

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


# string enums, validated on request bodies (pydantic constraints work across SQLModel versions)
Token = Annotated[str, StringConstraints(pattern=r"^(USDT|NIM)$")]
TaskCategory = Annotated[str, StringConstraints(pattern=r"^(brain_teaser|brain_memory|fitness_health|mindfulness|finance_iq)$")]
Difficulty = Annotated[str, StringConstraints(pattern=r"^(easy|medium|hard)$")]
RuleType = Annotated[str, StringConstraints(pattern=r"^(time|api|location)$")]
ActivityKind = Annotated[str, StringConstraints(pattern=r"^(lock|unlock|swap|send|task|rule)$")]

# Goal.status:  pending (row created, lock tx not confirmed yet) -> active (lock found on-chain) -> liquidated (released)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands datetimes back naive. Everything we store is UTC, so re-attach the zone before comparing or serialising."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


# ───────────────────────────── User ─────────────────────────────
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    address: str = Field(index=True, unique=True)  # lowercase 0x… EVM address (wallet identity)
    username: Optional[str] = Field(default=None, index=True, unique=True)
    nim_address: Optional[str] = None  # Nimiq account as reported by the client. NOT verified, never use it for access control.
    created_at: datetime = Field(default_factory=utcnow)


class UserRead(SQLModel):
    id: int
    address: str
    username: Optional[str] = None
    nim_address: Optional[str] = None
    created_at: datetime


# ───────────────────────────── Sign-in challenge ─────────────────────────────
class AuthNonce(SQLModel, table=True):
    address: str = Field(primary_key=True)  # one pending challenge per wallet
    nonce: str
    message: str  # the exact text the wallet must sign
    expires_at: datetime


# ───────────────────────────── Goal ─────────────────────────────
# Metadata for a USDT lock. The funds live in the lock contract under (owner address, goal id = this row's id).
class GoalBase(SQLModel):
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0)
    token: Token = "USDT"
    unlock_at: AwareDatetime  # must carry a timezone, e.g. new Date().toISOString()
    task_category: TaskCategory  # which kind of AI task unlocks this goal early
    task_difficulty: Difficulty = "medium"


class Goal(GoalBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    status: str = Field(default="pending", index=True)
    tx_hash: Optional[str] = None  # lock tx
    release_tx_hash: Optional[str] = None  # early-release tx sent by the backend relayer
    amount_raw: Optional[str] = None  # on-chain amount in token units (string: can exceed 2^53). Copied from the contract at confirm.
    created_at: datetime = Field(default_factory=utcnow)
    liquidated_at: Optional[datetime] = None


class GoalCreate(GoalBase):
    pass


class GoalUpdate(SQLModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)


class GoalRead(GoalBase):
    id: int
    status: str
    tx_hash: Optional[str] = None
    release_tx_hash: Optional[str] = None
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


# ───────────────────────────── Task (AI-generated unlock task) ─────────────────────────────
# One row per generated task. status: pending -> passed | failed. Created and graded only by the server (task_ai.py),
# so TaskCreate / TaskUpdate are internal and are NOT exposed as request bodies. TaskRead hides the answer key,
# the rubric and the unlock nonce.
class TaskBase(SQLModel):
    goal_id: int = Field(foreign_key="goal.id", index=True)
    category: str
    difficulty: str
    title: str
    description: str
    submission_type: str  # text | image | audio | video
    answer_key: str = ""  # hidden from the client
    rubric: str = ""  # hidden from the client


class Task(TaskBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    status: str = Field(default="pending", index=True)
    attempts: int = 0
    max_attempts: int = 3
    score: Optional[float] = None
    feedback: Optional[str] = None
    unlock_nonce: Optional[str] = None  # fixed per task, so a task can only ever release once
    unlock_expires_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(SQLModel):
    status: Optional[str] = None
    attempts: Optional[int] = None
    score: Optional[float] = None
    feedback: Optional[str] = None
    unlock_nonce: Optional[str] = None
    unlock_expires_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TaskRead(SQLModel):
    id: int
    goal_id: int
    category: str
    difficulty: str
    title: str
    description: str
    submission_type: str
    status: str
    attempts: int
    max_attempts: int
    score: Optional[float] = None
    feedback: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
