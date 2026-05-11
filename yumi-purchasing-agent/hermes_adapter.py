"""Project-scoped Hermes adapter primitives for Yumi Telegram bots.

This module is intentionally passive: importing it does not route messages to
Hermes, call external services, or change Telegram bot behavior.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
HERMES_ROOT = PROJECT_ROOT / "hermes"
AUDIT_LOG = PROJECT_ROOT / "logs" / "hermes-agent" / "audit.jsonl"

VALID_PROFILES = {"general_ops", "finance", "purchasing", "supervisor"}
VALID_INPUT_TYPES = {"text", "photo", "callback", "document"}
VALID_MODES = {"read_only", "draft_action", "confirmed_write", "rejected"}


class HermesAdapterError(ValueError):
    """Raised when a Hermes request or response violates project contract."""


@dataclass(frozen=True)
class TelegramContext:
    chat_id: str
    user_id: str
    username: str = ""
    message_id: str = ""
    chat_type: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "chat_id": self.chat_id,
            "user_id": self.user_id,
            "username": self.username,
            "message_id": self.message_id,
            "chat_type": self.chat_type,
        }


def _load_action_permissions() -> dict[str, Any]:
    path = HERMES_ROOT / "policies" / "action-permissions.json"
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def allowed_actions_for(profile_id: str, mode: str = "draft") -> set[str]:
    """Return allowlisted actions for a profile and mode from project policy."""
    if profile_id not in VALID_PROFILES:
        raise HermesAdapterError(f"Unknown Hermes profile: {profile_id}")
    if mode not in {"read", "draft", "write"}:
        raise HermesAdapterError(f"Unknown permission mode: {mode}")

    policy = _load_action_permissions()
    profile_policy = policy.get("profiles", {}).get(profile_id, {})
    return set(profile_policy.get(mode, []))


def build_request(
    profile_id: str,
    telegram: TelegramContext,
    input_type: str,
    *,
    text: str = "",
    file_id: str = "",
    callback_data: str = "",
    can_write: bool = False,
    allowed_actions: list[str] | None = None,
) -> dict[str, Any]:
    """Build a Hermes request that stays inside the project-scoped contract."""
    if profile_id not in VALID_PROFILES:
        raise HermesAdapterError(f"Unknown Hermes profile: {profile_id}")
    if input_type not in VALID_INPUT_TYPES:
        raise HermesAdapterError(f"Unsupported input type: {input_type}")

    request: dict[str, Any] = {
        "profile_id": profile_id,
        "telegram": telegram.to_dict(),
        "input": {"type": input_type},
        "permissions": {
            "can_write": bool(can_write),
            "requires_confirmation": True,
            "allowed_actions": allowed_actions or [],
        },
    }
    if text:
        request["input"]["text"] = text
    if file_id:
        request["input"]["file_id"] = file_id
    if callback_data:
        request["input"]["callback_data"] = callback_data
    validate_request(request)
    return request


def validate_request(request: dict[str, Any]) -> None:
    """Validate the minimum Hermes request contract without external packages."""
    profile_id = request.get("profile_id")
    if profile_id not in VALID_PROFILES:
        raise HermesAdapterError("Request profile_id is missing or invalid")

    telegram = request.get("telegram")
    if not isinstance(telegram, dict) or not telegram.get("chat_id") or not telegram.get("user_id"):
        raise HermesAdapterError("Request telegram.chat_id and telegram.user_id are required")

    input_obj = request.get("input")
    if not isinstance(input_obj, dict) or input_obj.get("type") not in VALID_INPUT_TYPES:
        raise HermesAdapterError("Request input.type is missing or invalid")

    permissions = request.get("permissions")
    if not isinstance(permissions, dict):
        raise HermesAdapterError("Request permissions object is required")
    if not isinstance(permissions.get("can_write"), bool):
        raise HermesAdapterError("Request permissions.can_write must be boolean")
    if not isinstance(permissions.get("requires_confirmation"), bool):
        raise HermesAdapterError("Request permissions.requires_confirmation must be boolean")


def validate_response(response: dict[str, Any]) -> None:
    """Validate the minimum Hermes response contract before Telegram sends it."""
    if not isinstance(response.get("reply_text"), str):
        raise HermesAdapterError("Response reply_text is required")
    if not isinstance(response.get("actions"), list):
        raise HermesAdapterError("Response actions must be a list")
    if not isinstance(response.get("requires_confirmation"), bool):
        raise HermesAdapterError("Response requires_confirmation must be boolean")

    audit = response.get("audit")
    if not isinstance(audit, dict):
        raise HermesAdapterError("Response audit object is required")
    if audit.get("profile_id") not in VALID_PROFILES:
        raise HermesAdapterError("Response audit.profile_id is invalid")
    if audit.get("mode") not in VALID_MODES:
        raise HermesAdapterError("Response audit.mode is invalid")


def audit_event(event: dict[str, Any]) -> Path:
    """Append a sanitized project-local audit event and return the log path."""
    sanitized = _sanitize_for_audit(event)
    sanitized.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
    with AUDIT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(sanitized, ensure_ascii=False, sort_keys=True) + "\n")
    return AUDIT_LOG


def _sanitize_for_audit(value: Any) -> Any:
    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if any(secret in lowered for secret in ("token", "secret", "key", "password", "credential")):
                clean[key] = "[REDACTED]"
            else:
                clean[key] = _sanitize_for_audit(item)
        return clean
    if isinstance(value, list):
        return [_sanitize_for_audit(item) for item in value]
    return value


def project_scope_summary() -> dict[str, str]:
    """Expose scope paths for diagnostics without touching VPS-level resources."""
    return {
        "project_root": str(PROJECT_ROOT),
        "hermes_root": str(HERMES_ROOT),
        "audit_log": str(AUDIT_LOG),
        "mode": "passive_not_wired_to_telegram",
    }
