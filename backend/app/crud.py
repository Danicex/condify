from typing import Optional

from sqlmodel import Session, desc, select

from app.database import SessionDep
from app.model import Activity, Goal, Rule, Task

# user-owned resources only (User is not here: it is the owner, not owned)
obj_map = {
    "goal": Goal,
    "rule": Rule,
    "activity": Activity,
    "task": Task,
}

# never writable through update_data, whatever the client sends
PROTECTED = {"id", "user_id", "created_at"}

# foreign keys that must point at a row owned by the same user
OWNED_REFS = {"goal_id": Goal}


def _dump(data_obj, **kw) -> dict:
    if hasattr(data_obj, "model_dump"):
        return data_obj.model_dump(**kw)
    if hasattr(data_obj, "dict"):
        return data_obj.dict(**kw)
    return dict(data_obj)


def _refs_ok(values: dict, session: Session, user_id: int) -> bool:
    """A client must not be able to attach its rows to someone else's goal."""
    for field, ref_model in OWNED_REFS.items():
        ref_id = values.get(field)
        if ref_id is None:
            continue
        found = session.exec(select(ref_model).where(ref_model.id == ref_id, ref_model.user_id == user_id)).first()
        if not found:
            return False
    return True


def get_data(obj_name: str, obj_id: int, session: SessionDep, user_id: int):
    """Read one record owned by user_id (None if missing, not theirs, or unknown object)."""
    model_class = obj_map.get(obj_name.lower())
    if not model_class:
        return None
    return session.exec(
        select(model_class).where(model_class.id == obj_id, model_class.user_id == user_id)
    ).first()


def read_data(obj_name: str, session: SessionDep, user_id: int, limit: int = 100, offset: int = 0):
    """
    Read the user's records (newest first) with a limit. Returns None for an unknown object name.
    """
    model_class = obj_map.get(obj_name.lower())
    if not model_class:
        return None

    return session.exec(
        select(model_class)
        .where(model_class.user_id == user_id)
        .order_by(desc(model_class.id))
        .offset(offset)
        .limit(limit)
    ).all()


def create_data(obj_name: str, data_obj, session: SessionDep, user_id: int):
    """
    Create a record owned by user_id. Returns (ok, instance).
    user_id is always set here, any user_id in the payload is ignored.
    (User rows are not created here: a User is the owner, not owned. See routers/auth.py.)
    """
    model_class = obj_map.get(obj_name.lower())
    if not model_class:
        return False, None

    values = _dump(data_obj)
    values.pop("id", None)
    values["user_id"] = user_id
    if not _refs_ok(values, session, user_id):
        return False, None

    instance = model_class(**values)
    session.add(instance)
    session.commit()
    session.refresh(instance)
    return True, instance


def update_data(obj_name: str, obj_id: int, data_obj, session: SessionDep, user_id: int):
    """
    Update a record owned by user_id. Only fields the client actually sent are applied.
    Returns (ok, instance).
    """
    existing = get_data(obj_name, obj_id, session, user_id)
    if not existing:
        return False, None

    changes = {k: v for k, v in _dump(data_obj, exclude_unset=True).items() if k not in PROTECTED}
    if not _refs_ok(changes, session, user_id):
        return False, None

    for key, value in changes.items():
        if hasattr(existing, key):
            setattr(existing, key, value)

    session.add(existing)
    session.commit()
    session.refresh(existing)
    return True, existing


def delete_data(obj_name: str, obj_id: int, session: SessionDep, user_id: int) -> bool:
    """
    Delete a record owned by user_id.
    """
    existing = get_data(obj_name, obj_id, session, user_id)
    if not existing:
        return False

    session.delete(existing)
    session.commit()
    return True
