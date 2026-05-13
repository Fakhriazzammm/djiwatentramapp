"""learning_memory.py — Persistent learning memory untuk marketlist matching.

CRUD operations on a local JSON file.
Thread-safe via threading.Lock.
"""

import json
import os
import uuid
import threading
import logging
from datetime import datetime, timezone
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

LEARNING_FILE = os.path.join(os.path.dirname(__file__), "learning_memory.json")
_lock = threading.Lock()


def _read_memory() -> dict:
    if not os.path.exists(LEARNING_FILE):
        return {"version": 1, "entries": []}
    try:
        with _lock:
            with open(LEARNING_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("learning_memory: failed to read, resetting: %s", e)
        return {"version": 1, "entries": []}


def _write_memory(data: dict) -> None:
    data["last_updated"] = datetime.now(timezone.utc).isoformat()
    with _lock:
        # Atomic write via rename
        tmp = LEARNING_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, LEARNING_FILE)


def _fuzzy_score(a: str, b: str) -> float:
    """Simple SequenceMatcher ratio. 1.0 = exact, 0.0 = no similarity."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


# ── Public API ──────────────────────────────────────────────────


def load_learning_memory() -> list[dict]:
    """Return all entries, newest first."""
    entries = _read_memory()["entries"]
    entries.sort(key=lambda e: e.get("createdAt", ""), reverse=True)
    return entries


def search_learning_memory(user_input: str, min_score: float = 0.4) -> list[dict]:
    """Search entries by fuzzy match against userInput. Returns sorted by score desc."""
    entries = load_learning_memory()
    matched = []
    query = user_input.lower().strip()
    for e in entries:
        score = _fuzzy_score(query, e.get("userInput", "").lower())
        if score >= min_score:
            matched.append((score, e))
    matched.sort(key=lambda x: -x[0])
    return [e for _, e in matched]


def save_learning_entry(
    user_input: str,
    parsed_name: str = "",
    matched_inventory_id: str = "",
    matched_ingredient_name: str = "",
    suggested_supplier: str = "",
    suggested_supplier_phone: str = "",
    suggested_qty: float = 0,
    suggested_unit: str = "",
    suggested_price: float = 0,
    confidence: float = 0.0,
) -> str:
    """Create a new learning entry. Returns entry_id."""
    now = datetime.now(timezone.utc).isoformat()
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "userInput": user_input,
        "parsedName": parsed_name,
        "matchedInventoryId": matched_inventory_id,
        "matchedIngredientName": matched_ingredient_name,
        "suggestedSupplier": suggested_supplier,
        "suggestedSupplierPhone": suggested_supplier_phone,
        "suggestedQty": suggested_qty,
        "suggestedUnit": suggested_unit,
        "suggestedPrice": suggested_price,
        "isCorrected": False,
        "correctionType": None,
        "correctionPayload": None,
        "confirmedByUser": False,
        "confidence": confidence,
        "usageCount": 1,
        "createdAt": now,
        "updatedAt": now,
    }
    data = _read_memory()
    data["entries"].append(entry)
    data["version"] = data.get("version", 1) + 1
    _write_memory(data)
    return entry_id


def update_learning_entry(entry_id: str, updates: dict) -> bool:
    """Update an existing entry by ID. Returns True if found and updated."""
    data = _read_memory()
    now = datetime.now(timezone.utc).isoformat()
    for e in data["entries"]:
        if e["id"] == entry_id:
            e.update(updates)
            e["updatedAt"] = now
            if "usageCount" in updates:
                pass  # explicit
            else:
                e["usageCount"] = e.get("usageCount", 1)
            _write_memory(data)
            return True
    return False


def increment_usage(entry_id: str) -> bool:
    """Increment usageCount for an entry."""
    data = _read_memory()
    now = datetime.now(timezone.utc).isoformat()
    for e in data["entries"]:
        if e["id"] == entry_id:
            e["usageCount"] = e.get("usageCount", 1) + 1
            e["updatedAt"] = now
            _write_memory(data)
            return True
    return False


def delete_learning_entry(entry_id: str) -> bool:
    """Delete an entry by ID. Returns True if found and removed."""
    data = _read_memory()
    before = len(data["entries"])
    data["entries"] = [e for e in data["entries"] if e["id"] != entry_id]
    if len(data["entries"]) != before:
        _write_memory(data)
        return True
    return False


def get_learning_entry(entry_id: str) -> dict | None:
    """Get a single entry by ID."""
    for e in load_learning_memory():
        if e["id"] == entry_id:
            return e
    return None
