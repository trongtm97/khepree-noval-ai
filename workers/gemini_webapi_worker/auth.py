"""Request auth helpers for Gemini Web API worker."""

from __future__ import annotations

import os

from fastapi import Header, HTTPException


def require_shared_secret(
    x_nts_secret: str | None = Header(default=None, alias="X-NTS-Secret"),
) -> None:
    expected = os.environ.get("NTS_GEMINI_WORKER_SECRET", "")
    if not expected:
        raise HTTPException(status_code=500, detail="Worker secret not configured")
    if x_nts_secret != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")
