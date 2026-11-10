"""
Wallet-signature login (Sign-In-with-Ethereum style). No passwords: the user proves they control the address.

  1. GET  /auth/nonce?address=0x…        server stores a one-time challenge, returns the exact message to sign
  2. wallet signs it (personal_sign / ethers signer.signMessage(message))
  3. POST /auth/create_user  {address, username, signature}   first time: verifies the signature, creates the user, returns a JWT
     POST /auth/login        {address, signature}             returning user: verifies the signature, returns a JWT
  4. every other route sends  Authorization: Bearer <jwt>   and depends on CurrentUser (get_current_user below)

Env:
  JWT_SECRET       required, long random string (e.g. `openssl rand -hex 32`)
  JWT_TTL_HOURS    default 24
  AUTH_DOMAIN      shown in the signed message, default "nimlock"
  AUTH_DEV_MODE=1  dev only: also accept an `X-Dev-Address` header when no Bearer token is sent. Never set in production.
"""
import os
import re
import secrets
from datetime import timedelta
from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, StringConstraints
from sqlmodel import select

from app.database import SessionDep
from app.model import AuthNonce, User, UserRead, utcnow
from app.wallet import normalize_address, verify_signed_message

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)

NONCE_TTL = timedelta(minutes=5)
Username = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_]{3,20}$")]
Signature = Annotated[str, StringConstraints(pattern=r"^0x[0-9a-fA-F]{130}$")]  # 65-byte ECDSA signature


def _norm(address: str) -> str:
    try:
        return normalize_address(address)
    except ValueError:
        raise HTTPException(422, "invalid wallet address")


# ───────────────────────────── JWT ─────────────────────────────
def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret or len(secret) < 16:
        raise HTTPException(500, "server auth is not configured (JWT_SECRET)")
    return secret


def generate_jwt_token(user_id: int, address: str) -> str:
    now = utcnow()
    claims = {
        "sub": str(user_id),
        "addr": address.lower(),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=float(os.getenv("JWT_TTL_HOURS", "24")))).timestamp()),
    }
    return jwt.encode(claims, _secret(), algorithm="HS256")


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=["HS256"], options={"require": ["exp", "sub", "addr"]})
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid or expired token", headers={"WWW-Authenticate": "Bearer"})


# ───────────────────────────── current user ─────────────────────────────
def get_current_user(
    session: SessionDep,
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer)] = None,
    x_dev_address: Annotated[Optional[str], Header()] = None,
) -> User:
    """Authenticate the request and return the User row. Every data route depends on this, so ownership is always the verified user."""
    if creds is None:
        if os.getenv("AUTH_DEV_MODE") == "1" and x_dev_address:  # dev convenience only
            addr = _norm(x_dev_address)
            user = session.exec(select(User).where(User.address == addr)).first()
            if not user:
                user = User(address=addr)
                session.add(user)
                session.commit()
                session.refresh(user)
            return user
        raise HTTPException(401, "not authenticated", headers={"WWW-Authenticate": "Bearer"})

    claims = _decode(creds.credentials)
    user = session.get(User, int(claims["sub"]))
    if not user or user.address != claims["addr"]:  # deleted user, or token minted for another address
        raise HTTPException(401, "invalid token", headers={"WWW-Authenticate": "Bearer"})
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# ───────────────────────────── sign-in challenge ─────────────────────────────
class NonceOut(BaseModel):
    address: str
    nonce: str
    message: str  # sign exactly this string
    expires_at: str


@router.get("/nonce", response_model=NonceOut)
def get_nonce(session: SessionDep, address: str = Query(...)):
    addr = _norm(address)
    now = utcnow()
    nonce = secrets.token_hex(16)
    expires = now + NONCE_TTL
    message = (
        f"{os.getenv('AUTH_DOMAIN', 'nimlock')} wants you to sign in with your wallet.\n\n"
        f"Address: {addr}\nNonce: {nonce}\nIssued At: {now.isoformat()}\nExpires At: {expires.isoformat()}\n\n"
        "This only proves you own the address. It does not move any funds."
    )
    row = session.get(AuthNonce, addr)
    if row:  # one pending challenge per address: a new request replaces the old one
        row.nonce, row.message, row.expires_at = nonce, message, expires
    else:
        row = AuthNonce(address=addr, nonce=nonce, message=message, expires_at=expires)
    session.add(row)
    session.commit()
    return NonceOut(address=addr, nonce=nonce, message=message, expires_at=expires.isoformat())


def _consume_challenge(session: SessionDep, address: str, signature: str) -> None:
    """Checks the signature against the stored challenge, then burns the nonce (single use). Raises 401 on any failure."""
    row = session.get(AuthNonce, address)
    if not row or row.expires_at <= utcnow():
        raise HTTPException(401, "no valid challenge for this address, request a new nonce")
    if not verify_signed_message(address, row.message, signature):
        raise HTTPException(401, "invalid signature for this address")
    session.delete(row)  # burned only after a valid signature, so a stranger can't use up someone else's nonce
    session.commit()


# ───────────────────────────── create user / login ─────────────────────────────
class CreateUser(BaseModel):
    addrs: str  # wallet (EVM) address
    username: Username
    signature: Signature  # signature of the message from GET /auth/nonce
    nim_address: Optional[str] = None


class Login(BaseModel):
    addrs: str
    signature: Signature


class AuthOut(BaseModel):
    token: str
    user: UserRead


@router.post("/create_user", response_model=AuthOut, status_code=201)
def create_user(payload: CreateUser, session: SessionDep):
    addr = _norm(payload.addrs)
    if session.exec(select(User).where(User.address == addr)).first():
        raise HTTPException(409, "this wallet already has an account, use /auth/login")
    if session.exec(select(User).where(User.username == payload.username)).first():
        raise HTTPException(409, "username is taken")
    _consume_challenge(session, addr, payload.signature)  # proves the caller owns `addr`

    # User is the owner of every other row (not owned itself), so it is created directly instead of through
    # crud.create_data, which stamps a user_id on the record.
    user = User(address=addr, username=payload.username, nim_address=payload.nim_address)
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthOut(token=generate_jwt_token(user.id, user.address), user=user)


@router.post("/login", response_model=AuthOut)
def login(payload: Login, session: SessionDep):
    addr = _norm(payload.addrs)
    user = session.exec(select(User).where(User.address == addr)).first()
    if not user:
        raise HTTPException(404, "no account for this wallet, use /auth/create_user")
    _consume_challenge(session, addr, payload.signature)
    return AuthOut(token=generate_jwt_token(user.id, user.address), user=user)
