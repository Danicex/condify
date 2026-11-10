"""
AI unlock tasks.

  POST /goals/{id}/task          generate (or return the pending) task for this goal. Category and difficulty are always the
                                 ones committed when the goal was created: the client cannot pick an easier task later
  GET  /goals/{id}/task          the latest task for this goal
  POST /goals/{id}/task/verify   multipart: `text` and/or `file`. The AI judges the proof; on a pass the backend relays the
                                 unlock key to the contract and the response says whether the funds were released
  GET  /tasks                    passed tasks (drives "tasks done" and the streak)

The client only ever sees title / description / what to submit. The answer key, rubric and unlock nonce never leave the server.
"""
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from sqlmodel import desc, select

from app import crud, task_ai
from app.database import SessionDep
from app.deps import CurrentUser
from app.errors import ApiError
from app.model import Task, TaskRead

router = APIRouter(tags=["task"])

MAX_UPLOAD = max(task_ai.MAX_BYTES.values())


@router.post("/goals/{goal_id}/task", response_model=TaskRead)
def generate_task(goal_id: int, session: SessionDep, user: CurrentUser):
    goal = crud.get_data("goal", goal_id, session, user.id)
    if not goal:
        raise HTTPException(404, "goal not found")
    return task_ai.generate_goal_task(goal.task_category, goal.task_difficulty, session, user.id, goal_id)


@router.get("/goals/{goal_id}/task", response_model=TaskRead)
def current_task(goal_id: int, session: SessionDep, user: CurrentUser):
    task = session.exec(select(Task).where(Task.user_id == user.id, Task.goal_id == goal_id).order_by(desc(Task.id))).first()
    if not task:
        raise HTTPException(404, "no task for this goal yet")
    return task


@router.post("/goals/{goal_id}/task/verify")
def verify_task(
    goal_id: int,
    session: SessionDep,
    user: CurrentUser,
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    media = None
    if file is not None and file.filename:
        data = file.file.read(MAX_UPLOAD + 1)  # never buffer more than the biggest allowed upload
        if len(data) > MAX_UPLOAD:
            raise ApiError(413, "file is too large")
        media = (data, file.content_type or "")
    return task_ai.verify_goal_task(goal_id, session, user.id, text=text, media=media)


@router.get("/tasks", response_model=list[TaskRead])
def completed_tasks(session: SessionDep, user: CurrentUser, limit: int = Query(500, ge=1, le=500)):
    return session.exec(select(Task).where(Task.user_id == user.id, Task.status == "passed").order_by(desc(Task.id)).limit(limit)).all()
