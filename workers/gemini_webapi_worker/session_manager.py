"""Per-account cookie files for gemini-web2api. Never logs cookies."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

from gemini_web2api import CONFIG, MODELS, extract_response_text, gemini_stream_generate

logger = logging.getLogger("gemini_webapi_worker.session")

COOKIE_FILENAME = "cookie.txt"

# Legacy Khepree Novel AI model ids → gemini-web2api model names
LEGACY_MODEL_MAP: dict[str, str] = {
    "gemini-flash": "gemini-3.6-flash",
    "gemini-pro": "gemini-3.1-pro",
}


def format_cookie(secure_1psid: str, secure_1psidts: str = "") -> str:
    parts = [f"__Secure-1PSID={secure_1psid.strip()}"]
    if secure_1psidts.strip():
        parts.append(f"__Secure-1PSIDTS={secure_1psidts.strip()}")
    return "; ".join(parts)


def resolve_model(model: str | None) -> tuple[str, int, int]:
    raw = (model or "").strip()
    name = LEGACY_MODEL_MAP.get(raw, raw) or CONFIG.get("default_model", "gemini-3.6-flash")
    cfg = MODELS.get(name)
    if not cfg:
        name = CONFIG.get("default_model", "gemini-3.6-flash")
        cfg = MODELS[name]
    return name, int(cfg["mode"]), int(cfg["think"])


class SessionManager:
    def __init__(self) -> None:
        self._accounts: dict[str, str] = {}
        self._started = time.monotonic()

    def uptime_sec(self) -> float:
        return time.monotonic() - self._started

    def list_account_ids(self) -> list[str]:
        return list(self._accounts.keys())

    def cookie_path(self, account_id: str) -> str | None:
        session_dir = self._accounts.get(account_id)
        if not session_dir:
            return None
        return os.path.join(session_dir, COOKIE_FILENAME)

    def init_account(
        self,
        *,
        account_id: str,
        session_dir: str,
        secure_1psid: str,
        secure_1psidts: str,
    ) -> None:
        os.makedirs(session_dir, exist_ok=True)
        cookie_path = os.path.join(session_dir, COOKIE_FILENAME)
        with open(cookie_path, "w", encoding="utf-8") as handle:
            handle.write(format_cookie(secure_1psid, secure_1psidts))
        self._accounts[account_id] = session_dir
        logger.info("session ready account=%s", account_id)

    def activate(self, account_id: str) -> None:
        path = self.cookie_path(account_id)
        if not path or not os.path.exists(path):
            raise RuntimeError(f"SESSION_EXPIRED: no session for account {account_id}")
        CONFIG["cookie_file"] = path

    def generate(
        self,
        *,
        account_id: str,
        prompt: str,
        model: str | None = None,
        files: list[str] | None = None,
    ) -> str:
        if files:
            raise RuntimeError("ERROR: file attachments not supported in gemini-web2api worker v1")
        self.activate(account_id)
        _model_name, model_id, think_mode = resolve_model(model)
        raw = gemini_stream_generate(prompt, model_id, think_mode)
        return extract_response_text(raw)

    def list_models(self, account_id: str) -> list[dict[str, Any]]:
        self.activate(account_id)
        return [
            {"model_name": name, "display_name": cfg.get("desc", name)}
            for name, cfg in MODELS.items()
        ]
