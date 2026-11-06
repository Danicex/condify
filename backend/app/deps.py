"""
Current-user dependency. Every data route depends on this, so ownership is always the *authenticated* user.

AUTH IS NOT BUILT YET (wallet-signature login is next). Until then this accepts an `X-Dev-Address`
header, and ONLY when AUTH_DEV_MODE=1. With it unset every request gets 401, so this cannot ship open by accident.
When SIWE/JWT lands, replace the body of get_current_user: read the verified address from the token. Nothing else changes.
"""
import os
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlmodel import select

from app.database import SessionDep
from app.model import User


def get_current_user(session: SessionDep, x_dev_address: Annotated[str | None, Header()] = None) -> User:
    if os.getenv("AUTH_DEV_MODE") != "1" or not x_dev_address:
        raise HTTPException(status_code=401, detail="Not authenticated")
    address = x_dev_address.strip().lower()
    user = session.exec(select(User).where(User.address == address)).first()
    if not user:
        user = User(address=address)
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
