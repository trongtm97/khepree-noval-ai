"""NovelTrans Gemini worker — gemini-web2api backend with account bridge.

Upstream: https://github.com/Sophomoresty/gemini-web2api (MIT)
"""

from __future__ import annotations

import json
import logging
import os
import time
from http.server import HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, urlparse

import gemini_web2api as g2a
from gemini_web2api import CONFIG, GeminiHandler, fetch_latest_bl

from session_manager import SessionManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("gemini_webapi_worker")

HOST = os.environ.get("NTS_GEMINI_WORKER_HOST", "127.0.0.1")
PORT = int(os.environ.get("NTS_GEMINI_WORKER_PORT", "18765"))

sessions = SessionManager()

_SOFT_ERROR_MARKERS = (
    "sorry, something went wrong",
    "please try your request again",
    "i encountered an error doing what you asked",
    "i'm having a hard time fulfilling your request",
    "can i help you with something else instead",
    "unable to process your request",
)


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


def is_gemini_soft_error_text(text: str | None) -> bool:
    if not text:
        return False
    trimmed = text.strip()
    if not trimmed or len(trimmed) > 800:
        return False
    lower = trimmed.lower()
    if "<translation>" in lower or "[c" in lower and ":p" in lower:
        return False
    return any(marker in lower for marker in _SOFT_ERROR_MARKERS)


def configure_from_env() -> None:
    secret = os.environ.get("NTS_GEMINI_WORKER_SECRET", "")
    CONFIG.update(
        {
            "host": HOST,
            "port": PORT,
            "api_keys": [secret] if secret else [],
            "log_requests": True,
            "temporary_chats": True,
            "default_model": "gemini-3.6-flash",
        }
    )
    new_bl = fetch_latest_bl()
    if new_bl:
        CONFIG["gemini_bl"] = new_bl


class NovelTransHandler(GeminiHandler):
    def _nts_secret_ok(self) -> bool:
        expected = os.environ.get("NTS_GEMINI_WORKER_SECRET", "")
        if not expected:
            return False
        if self.headers.get("X-NTS-Secret", "") == expected:
            return True
        auth = self.headers.get("Authorization", "")
        return auth == f"Bearer {expected}"

    def _reject_localhost(self) -> bool:
        client = self.client_address[0] if self.client_address else ""
        return client not in ("127.0.0.1", "::1", "localhost", "testclient")

    def do_GET(self) -> None:
        if self._reject_localhost():
            self.send_json({"detail": "Localhost only"}, 403)
            return
        if self.path == "/health":
            if not self._nts_secret_ok():
                self.send_json({"detail": "Unauthorized"}, 401)
                return
            self.send_json(
                {
                    "ok": True,
                    "accounts": sessions.list_account_ids(),
                    "uptime_sec": sessions.uptime_sec(),
                    "engine": "gemini-web2api",
                    "version": g2a.__version__,
                }
            )
            return
        if self.path.startswith("/gemini/models"):
            if not self._nts_secret_ok():
                self.send_json({"detail": "Unauthorized"}, 401)
                return
            query = parse_qs(urlparse(self.path).query)
            account_id = (query.get("account_id") or [""])[0]
            try:
                models = sessions.list_models(account_id)
                self.send_json({"status": "SUCCESS", "models": models})
            except Exception as exc:  # noqa: BLE001
                status, message = map_exception(exc)
                self.send_json({"status": status, "models": [], "error": message})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self._reject_localhost():
            self.send_json({"detail": "Localhost only"}, 403)
            return
        if self.path == "/gemini/session/init":
            if not self._nts_secret_ok():
                self.send_json({"detail": "Unauthorized"}, 401)
                return
            body = json.loads(self._read_request_body() or b"{}")
            try:
                sessions.init_account(
                    account_id=body["account_id"],
                    session_dir=body["session_dir"],
                    secure_1psid=body["secure_1psid"],
                    secure_1psidts=body.get("secure_1psidts") or "",
                )
                self.send_json({"status": "SUCCESS", "account_id": body["account_id"]})
            except Exception as exc:  # noqa: BLE001
                status, message = map_exception(exc)
                logger.warning(
                    "session init failed account=%s status=%s",
                    body.get("account_id"),
                    status,
                )
                self.send_json(
                    {
                        "status": status,
                        "account_id": body.get("account_id"),
                        "error": message,
                    }
                )
            return

        if self.path == "/gemini/chat":
            if not self._nts_secret_ok():
                self.send_json({"detail": "Unauthorized"}, 401)
                return
            body = json.loads(self._read_request_body() or b"{}")
            request_id = body.get("request_id", "")
            account_id = body.get("account_id", "")
            started = time.monotonic()
            try:
                text = sessions.generate(
                    account_id=account_id,
                    prompt=body["prompt"],
                    model=body.get("model"),
                    files=body.get("attachments"),
                )
                elapsed_ms = int((time.monotonic() - started) * 1000)
                if is_gemini_soft_error_text(text):
                    logger.warning(
                        "chat soft-error account=%s request_id=%s elapsed_ms=%s",
                        account_id,
                        request_id,
                        elapsed_ms,
                    )
                    self.send_json(
                        {
                            "request_id": request_id,
                            "status": "SERVICE_UNAVAILABLE",
                            "text": "",
                            "usage": None,
                            "error": (text or "").strip()[:240],
                        }
                    )
                    return
                logger.info(
                    "chat ok account=%s request_id=%s elapsed_ms=%s",
                    account_id,
                    request_id,
                    elapsed_ms,
                )
                self.send_json(
                    {
                        "request_id": request_id,
                        "status": "SUCCESS",
                        "text": text or "",
                        "usage": None,
                        "error": None,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                status, message = map_exception(exc)
                logger.warning(
                    "chat failed account=%s request_id=%s status=%s",
                    account_id,
                    request_id,
                    status,
                )
                self.send_json(
                    {
                        "request_id": request_id,
                        "status": status,
                        "text": "",
                        "usage": None,
                        "error": message,
                    }
                )
            return

        if self.path == "/gemini/cancel":
            if not self._nts_secret_ok():
                self.send_json({"detail": "Unauthorized"}, 401)
                return
            body = json.loads(self._read_request_body() or b"{}")
            self.send_json({"status": "SUCCESS", "request_id": body.get("request_id", "")})
            return

        super().do_POST()


def main() -> None:
    if HOST not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("Refusing to bind non-localhost host")
    configure_from_env()

    class ThreadedServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True
        allow_reuse_address = True

    server = ThreadedServer((HOST, PORT), NovelTransHandler)
    logger.info(
        "Starting gemini-web2api worker on %s:%s (v%s)",
        HOST,
        PORT,
        g2a.__version__,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Stopped.")
        server.shutdown()


if __name__ == "__main__":
    main()
