"""Per-account GeminiClient sessions. Never logs cookies."""

from __future__ import annotations

import logging
import os
import time
from typing import Any

logger = logging.getLogger("gemini_webapi_worker.session")


class SessionManager:
    def __init__(self) -> None:
        self._clients: dict[str, Any] = {}
        self._started = time.monotonic()

    def uptime_sec(self) -> float:
        return time.monotonic() - self._started

    def list_account_ids(self) -> list[str]:
        return list(self._clients.keys())

    async def init_account(
        self,
        *,
        account_id: str,
        session_dir: str,
        secure_1psid: str,
        secure_1psidts: str,
    ) -> None:
        os.makedirs(session_dir, exist_ok=True)
        # Persist auto-refreshed cookies under this account dir only
        os.environ["GEMINI_COOKIE_PATH"] = session_dir

        from gemini_webapi import GeminiClient

        # Close previous client for this account if any
        old = self._clients.pop(account_id, None)
        if old is not None:
            try:
                await old.close()
            except Exception:  # noqa: BLE001
                pass

        client = GeminiClient(secure_1psid, secure_1psidts or None, proxy=None)
        await client.init(timeout=30, auto_close=False, auto_refresh=True)
        self._clients[account_id] = client
        logger.info("session ready account=%s", account_id)

    def _require(self, account_id: str) -> Any:
        client = self._clients.get(account_id)
        if client is None:
            raise RuntimeError(f"SESSION_EXPIRED: no session for account {account_id}")
        return client

    async def generate(
        self,
        *,
        account_id: str,
        prompt: str,
        model: str | None = None,
        files: list[str] | None = None,
    ) -> str:
        client = self._require(account_id)
        kwargs: dict[str, Any] = {}
        if model:
            kwargs["model"] = model
        if files:
            kwargs["files"] = files
        output = await client.generate_content(prompt, **kwargs)
        text = getattr(output, "text", None)
        if text is None:
            text = str(output)
        return text

    async def list_models(self, account_id: str) -> list[dict[str, Any]]:
        client = self._require(account_id)
        raw = []
        if hasattr(client, "list_models"):
            raw = await client.list_models()
        result: list[dict[str, Any]] = []
        for item in raw or []:
            name = getattr(item, "name", None) or getattr(item, "model_name", None) or str(item)
            display = getattr(item, "display_name", None) or name
            result.append({"model_name": name, "display_name": display})
        return result

    async def close_all(self) -> None:
        for account_id, client in list(self._clients.items()):
            try:
                await client.close()
            except Exception:  # noqa: BLE001
                pass
            self._clients.pop(account_id, None)
