from contextlib import asynccontextmanager

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import init_db
from app.deps import CurrentUser
from app.errors import ApiError
from app.model import UserRead
from app.routers import auth, goals, tasks
from app.routers.data import routers


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Nimlock API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://condify.onrender.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ApiError)
async def api_error_handler(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


app.include_router(auth.router)
app.include_router(goals.router)
app.include_router(tasks.router)
for r in routers:
    app.include_router(r)


@app.get("/me", response_model=UserRead, tags=["user"])
def me(user: CurrentUser):
    return user
