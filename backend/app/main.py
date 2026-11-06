from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db
from app.deps import CurrentUser
from app.model import UserRead
from app.routers.data import routers


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Nimlock API", lifespan=lifespan)

for r in routers:
    app.include_router(r)


@app.get("/me", response_model=UserRead, tags=["user"])
def me(user: CurrentUser):
    return user
