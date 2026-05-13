from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.models import UserRecord
from app.repositories import mongodb
from app.repositories.mongodb import InMemoryRepository
from app.services.requests import create_operator_request
from app.services.tokens import generate_token, hash_token, normalize_username
from app.settings import settings

router = APIRouter(prefix="/cli", tags=["private-cli"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)


class LoginResponse(BaseModel):
    username_normalized: str
    claimed: bool
    token: str | None = None


class CreateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class CreateResponse(BaseModel):
    request_id: str


class GetResponse(BaseModel):
    request_id: str
    status: str
    reply: str | None = None


def get_repo() -> InMemoryRepository:
    return mongodb.repository


def bearer_token(authorization: Annotated[str | None, Header()] = None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    return authorization.removeprefix("Bearer ").strip()


def current_user(repo: Annotated[InMemoryRepository, Depends(get_repo)], token: Annotated[str, Depends(bearer_token)]) -> UserRecord:
    user = repo.authenticate(token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid bearer token")
    return user


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, repo: Annotated[InMemoryRepository, Depends(get_repo)]):
    try:
        normalized = normalize_username(payload.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    token = generate_token()
    user, claimed = repo.claim_user(payload.username, normalized, hash_token(token))
    return LoginResponse(username_normalized=user.username_normalized, claimed=claimed, token=token if claimed else None)


@router.post("/requests", response_model=CreateResponse)
async def create_request(
    payload: CreateRequest,
    request: Request,
    repo: Annotated[InMemoryRepository, Depends(get_repo)],
    user: Annotated[UserRecord, Depends(current_user)],
):
    created = await create_operator_request(
        repo=repo,
        telegram=request.app.state.telegram,
        user_id=user.id,
        sender_username=user.username_normalized,
        message=payload.message,
        operator_chat_id=settings.telegram_operator_chat_id,
    )
    return CreateResponse(request_id=created.id)


@router.get("/requests/{request_id}", response_model=GetResponse)
async def get_request(
    request_id: str,
    repo: Annotated[InMemoryRepository, Depends(get_repo)],
    user: Annotated[UserRecord, Depends(current_user)],
    wait: bool = False,
    timeout_seconds: float = 15.0,
):
    deadline = asyncio.get_running_loop().time() + min(timeout_seconds, 60.0)
    while True:
        request = repo.get_request_for_user(request_id, user.id)
        if request is None:
            raise HTTPException(status_code=404, detail="request not found")
        reply = repo.get_reply(request_id)
        if reply:
            return GetResponse(request_id=request_id, status="replied", reply=reply.reply_text)
        if not wait or asyncio.get_running_loop().time() >= deadline:
            return GetResponse(request_id=request_id, status="pending", reply=None)
        await asyncio.sleep(0.25)
