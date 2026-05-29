"""Utilities for normalizing item aliases and unit abbreviations.

Two-phase alias resolution:
1. DB-backed alias cache (loaded from pos.inventory.aliases column)
2. Programmatic fallback for items not in DB
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)

UNIT_ALIASES: dict[str, str] = {
    "ctn": "karton",
    "carton": "karton",
    "karton": "karton",
    "dus": "karton",
    "box": "box",
    "pcs": "pcs",
    "pc": "pcs",
    "pack": "pack",
    "pkt": "pack",
    "btl": "botol",
    "botol": "botol",
    "ltr": "l",
    "liter": "l",
    "lt": "l",
    "ml": "ml",
    "kg": "kg",
    "kilo": "kg",
    "gr": "gr",
    "gram": "gr",
    "g": "g",
}

# ── In-memory DB alias cache ──────────────────────────────────────────
# { alias_key: canonical_name }
# alias_key = str(alias).lower().strip()
_DB_ALIAS_MAP: dict[str, str] = {}

# Reverse map: canonical_name → list of DB aliases
_DB_REVERSE_MAP: dict[str, list[str]] = {}


def load_aliases_from_db(aliases_data: list[dict]) -> None:
    """Load + cache aliases from pos.inventory rows.
    
    Each row: {"ingredient_name": ..., "aliases": [...]}
    """
    _DB_ALIAS_MAP.clear()
    _DB_REVERSE_MAP.clear()
    
    for row in aliases_data:
        name = (row.get("ingredient_name") or "").strip()
        aliases = row.get("aliases") or []
        if not name:
            continue
        
        canon_key = name.lower()
        known_aliases = []
        for alias in aliases:
            a = (alias or "").strip()
            if not a:
                continue
            ak = a.lower()
            if ak == canon_key:
                continue  # skip self-alias
            _DB_ALIAS_MAP[ak] = name
            known_aliases.append(a)
        
        if known_aliases:
            _DB_REVERSE_MAP[canon_key] = known_aliases
    
    logger.info(
        "Loaded %d alias entries for %d inventory items",
        len(_DB_ALIAS_MAP), len(aliases_data),
    )


def _db_resolve(name: str) -> tuple[str, str] | None:
    """Try DB alias lookup. Returns (canonical_name, original_alias) or None."""
    key = (name or "").strip().lower()
    if not key:
        return None
    
    # Exact match on full alias
    canonical = _DB_ALIAS_MAP.get(key)
    if canonical:
        return canonical, name
    
    # Token-level: check if this looks like known brand+item shorthands
    # e.g. "FM GF" -> check each token
    tokens = [t for t in re.split(r"[\s/]+", key) if t]
    
    # Try multi-token combinations against alias keys
    # The alias key "fm gf" matches, but for "FM GF 1L" or "FM GF 1 karton":
    for combo_len in range(len(tokens), 0, -1):
        for i in range(len(tokens) - combo_len + 1):
            combo = " ".join(tokens[i:i+combo_len])
            canonical = _DB_ALIAS_MAP.get(combo)
            if canonical:
                return canonical, name
    
    return None


def _programmatic_resolve(name: str) -> tuple[str, str]:
    """Generate programmatic aliases from item name (fallback).

    Patterns:
    - Known brand+product combinations (reverse lookup)
    - Brand prefix stripping: "Diamond Margarin" → known "Margarin"
    - Whole name already in DB → skip
    """
    raw = (name or "").strip()
    if not raw:
        return "", ""

    canon_key = raw.lower()

    # Already a canonical name (in DB)? Skip.
    for db_key, db_canon in _DB_ALIAS_MAP.items():
        if db_canon.lower() == canon_key:
            return "", ""

    tokens = [t for t in re.split(r"[\s/]+", raw) if t]
    if not tokens:
        return raw, ""

    # ── Strategy 1: Try each token combo against alias map ───────
    for combo_len in range(len(tokens), 0, -1):
        for i in range(len(tokens) - combo_len + 1):
            combo = " ".join(tokens[i:i+combo_len])
            found = _DB_ALIAS_MAP.get(combo.lower())
            if found:
                return found, raw

    # ── Strategy 2: Strip known single-word brand prefix ─────────
    # Common brand prefixes that are NOT the actual item name
    # e.g. "Diamond Margarin" -> check if "Margarin" is in aliases
    # e.g. "Blue Band Margarin" -> if "Margarin" is known alias
    # e.g. "Yoa Basil" -> check if "Basil" is known
    # Only strip ONE word from front
    if len(tokens) >= 2:
        # Try last token(s) as the core item
        for tail_len in range(len(tokens) - 1, 0, -1):
            tail = " ".join(tokens[-tail_len:])
            found = _DB_ALIAS_MAP.get(tail.lower())
            if found:
                return found, raw

    # ── Strategy 3: Known brand prefix stripping ─────────────────
    # Known brand names that frequently prefix product names in receipts
    known_brands = [
        "yoa", "diamond", "blueband", "filma", "bimoli", "sania",
        "rosebrand", "kobe", "sasa", "mamasuka", "indofood",
        "kraft", "prochiz", "greenfields", "dutchlady", "dancow",
        "bearbrand", "milkuat", "frisianflag", "nestle", "carnation",
        "capuang", "enak", "sosismeciko", "chimory", "ultra",
        "wisj", "evoo", "sunco",
    ]
    first_lower = tokens[0].lower()
    if first_lower in known_brands and len(tokens) >= 2:
        rest = " ".join(tokens[1:])
        # Check if rest (without brand prefix) is a known alias
        found = _DB_ALIAS_MAP.get(rest.lower())
        if found:
            return found, raw
        return rest, raw  # Return stripped name even if not in DB

    return raw, ""


def expand_item_alias(name: str) -> tuple[str, str]:
    """Return canonical item name + original alias if changed.
    
    Resolution priority:
    1. DB alias cache (exact + token combo match)
    2. Programmatic fallback (brand prefix stripping, etc.)
    """
    raw = (name or "").strip()
    if not raw:
        return "", ""

    # Phase 1: DB alias resolution
    db_result = _db_resolve(raw)
    if db_result:
        return db_result
    
    # Phase 2: Programmatic fallback
    prog_canon, prog_alias = _programmatic_resolve(raw)
    if prog_canon and prog_canon != raw:
        return prog_canon, prog_alias or raw
    
    return raw, ""


def normalize_unit(unit: str) -> str:
    u = (unit or "").strip().lower()
    if not u:
        return ""
    u = re.sub(r"[^a-z]", "", u)
    return UNIT_ALIASES.get(u, u)
