from contextlib import asynccontextmanager

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.deps import CurrentUser
from app.model import UserRead
from app.routers.data import routers


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Nimlock API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),  # comma-separated list
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in routers:
    app.include_router(r)


@app.get("/me", response_model=UserRead, tags=["user"])
def me(user: CurrentUser):
    return user
