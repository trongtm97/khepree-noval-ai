"""Gemini Web API worker — localhost HTTP bridge for NovelTrans Studio.

Uses gemini_webapi (HanaokaYuzu/Gemini-API). No translation business logic.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import require_shared_secret
from session_manager import SessionManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gemini_webapi_worker")

# Never log cookies / tokens
for noisy in ("httpx", "httpcore", "gemini_webapi"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

HOST = os.environ.get("NTS_GEMINI_WORKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("NTS_GEMINI_WORKER_PORT", "18765"))

app = FastAPI(title="NovelTrans Gemini Web API Worker", version="1.0.0")
sessions = SessionManager()

# In-flight cancel flags
_cancel_flags: dict[str, asyncio.Event] = {}


class SessionInitRequest(BaseModel):
    account_id: str
    session_dir: str
    secure_1psid: str = Field(..., min_length=1)
    secure_1psidts: str = ""
    email: str | None = None


class ChatRequest(BaseModel):
    request_id: str
    account_id: str
    model: str | None = None
    prompt: str = Field(..., min_length=1)
    system_instruction: str | None = None
    attachments: list[str] | None = None
    options: dict[str, Any] | None = None


class CancelRequest(BaseModel):
    request_id: str


def map_exception(exc: BaseException) -> tuple[str, str]:
    name = type(exc).__name__
    msg = str(exc)
    combined = f"{name}: {msg}"
    lower = combined.lower()
    if "auth" in lower or "login" in lower or "cookie" in lower or "401" in lower:
        if "expir" in lower:
            return "SESSION_EXPIRED", msg
        return "LOGIN_REQUIRED", msg
    if "429" in lower or "quota" in lower or "rate" in lower:
        return "RATE_LIMIT", msg
    if "timeout" in lower or "timed out" in lower:
        return "TIMEOUT", msg
    if "connect" in lower or "network" in lower or "refused" in lower:
        return "NETWORK_ERROR", msg
    if "503" in lower or "unavailable" in lower:
        return "SERVICE_UNAVAILABLE", msg
    return "ERROR", msg


_SOFT_ERROR_MARKERS = (
    "sorry, something went wrong",
    "please try your request again",
    "i encountered an error doing what you asked",
    "i'm having a hard time fulfilling your request",
    "can i help you with something else instead",
    "unable to process your request",
)


def is_gemini_soft_error_text(text: str | None) -> bool:
    """True when Gemini returned a polite failure bubble instead of content."""
    if not text:
        return False
    trimmed = text.strip()
    if not trimmed or len(trimmed) > 800:
        return False
    lower = trimmed.lower()
    if "<translation>" in lower or "[c" in lower and ":p" in lower:
        return False
    return any(marker in lower for marker in _SOFT_ERROR_MARKERS)


@app.middleware("http")
async def localhost_only(request: Request, call_next):  # type: ignore[no-untyped-def]
    client = request.client.host if request.client else ""
    if client not in ("127.0.0.1", "::1", "localhost", "testclient"):
        return JSONResponse(status_code=403, content={"detail": "Localhost only"})
    return await call_next(request)


@app.get("/health")
async def health(_: None = Depends(require_shared_secret)) -> dict[str, Any]:
    return {
        "ok": True,
        "accounts": sessions.list_account_ids(),
        "uptime_sec": sessions.uptime_sec(),
    }


@app.post("/gemini/session/init")
async def session_init(
    body: SessionInitRequest,
    _: None = Depends(require_shared_secret),
) -> dict[str, Any]:
    try:
        await sessions.init_account(
            account_id=body.account_id,
            session_dir=body.session_dir,
            secure_1psid=body.secure_1psid,
            secure_1psidts=body.secure_1psidts or "",
        )
        return {"status": "SUCCESS", "account_id": body.account_id}
    except Exception as exc:  # noqa: BLE001
        status, message = map_exception(exc)
        logger.warning("session init failed account=%s status=%s", body.account_id, status)
        return {"status": status, "account_id": body.account_id, "error": message}


@app.post("/gemini/chat")
async def chat(body: ChatRequest, _: None = Depends(require_shared_secret)) -> dict[str, Any]:
    cancel = asyncio.Event()
    _cancel_flags[body.request_id] = cancel
    started = time.monotonic()
    try:
        if cancel.is_set():
            return {
                "request_id": body.request_id,
                "status": "ERROR",
                "text": "",
                "usage": None,
                "error": "Cancelled",
            }

        text = await sessions.generate(
            account_id=body.account_id,
            prompt=body.prompt,
            model=body.model,
            files=body.attachments,
        )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        if is_gemini_soft_error_text(text):
            logger.warning(
                "chat soft-error account=%s request_id=%s elapsed_ms=%s",
                body.account_id,
                body.request_id,
                elapsed_ms,
            )
            return {
                "request_id": body.request_id,
                "status": "SERVICE_UNAVAILABLE",
                "text": "",
                "usage": None,
                "error": (text or "").strip()[:240],
            }
        logger.info(
            "chat ok account=%s request_id=%s elapsed_ms=%s",
            body.account_id,
            body.request_id,
            elapsed_ms,
        )
        return {
            "request_id": body.request_id,
            "status": "SUCCESS",
            "text": text or "",
            "usage": None,
            "error": None,
        }
    except Exception as exc:  # noqa: BLE001
        status, message = map_exception(exc)
        logger.warning(
            "chat failed account=%s request_id=%s status=%s",
            body.account_id,
            body.request_id,
            status,
        )
        return {
            "request_id": body.request_id,
            "status": status,
            "text": "",
            "usage": None,
            "error": message,
        }
    finally:
        _cancel_flags.pop(body.request_id, None)


@app.post("/gemini/cancel")
async def cancel(body: CancelRequest, _: None = Depends(require_shared_secret)) -> dict[str, Any]:
    flag = _cancel_flags.get(body.request_id)
    if flag:
        flag.set()
    return {"status": "SUCCESS", "request_id": body.request_id}


@app.get("/gemini/models")
async def list_models(
    account_id: str,
    _: None = Depends(require_shared_secret),
) -> dict[str, Any]:
    try:
        models = await sessions.list_models(account_id)
        return {"status": "SUCCESS", "models": models}
    except Exception as exc:  # noqa: BLE001
        status, message = map_exception(exc)
        return {"status": status, "models": [], "error": message}


def main() -> None:
    import uvicorn

    if HOST not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Refusing to bind non-localhost host")
    logger.info("Starting Gemini Web API worker on %s:%s", HOST, PORT)
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
