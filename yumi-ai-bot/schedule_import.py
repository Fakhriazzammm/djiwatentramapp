"""
Yumi GM Agent — Schedule Import Module

Parses Excel (.xlsx) attendance roster files and sends structured data
to the Yumi AI Edge Function for database insertion.

Supported formats:
- Matrix format: columns = staff names, rows = dates with shift values
- Auto-detects: staff columns, date column, week/hari columns
- Google Sheets link (public): auto-downloads as .xlsx
"""

import io
import re
import logging
import httpx
from datetime import datetime
from typing import Any

import openpyxl


GOOGLE_SHEETS_RE = re.compile(
    r"https?://docs\.google\.com/spreadsheets/d/([a-zA-Z0-9_-]+)"
)


def is_google_sheets_link(text: str) -> str | None:
    """Check if text contains a Google Sheets link and return the sheet ID."""
    m = GOOGLE_SHEETS_RE.search(text)
    return m.group(1) if m else None


async def download_google_sheet(sheet_id: str) -> bytes:
    """
    Download a public Google Sheet as .xlsx bytes.
    Uses the export format. Only works for publicly shared sheets.
    """
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx"
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content

logger = logging.getLogger("yumi-ai-bot")


# ─── Excel Parsing ──────────────────────────────────────────────


def _find_header_row(ws: openpyxl.worksheet.worksheet.Worksheet) -> int | None:
    """Find the row containing staff column headers (MINGGU KE, HARI, TANGGAL, etc.)."""
    for row_idx in range(1, min(ws.max_row or 10, 10) + 1):
        row_vals = [
            str(c.value or "").strip().upper()
            for c in ws[row_idx]
            if c.value is not None
        ]
        combined = " ".join(row_vals[:4])
        if "MINGGU" in combined and "HARI" in combined:
            return row_idx
    return None


def _find_staff_columns(
    ws: openpyxl.worksheet.worksheet.Worksheet, header_row: int
) -> list[dict]:
    """Extract staff column info from the header row."""
    staff_cols: list[dict] = []
    # Row 3 (1-indexed) usually has staff names; Row 2 has roles
    # But we use the row found by _find_header_row
    row = ws[header_row]

    # Find where staff columns start (after TANGGAL column)
    in_staff_area = False
    for col_idx, cell in enumerate(row, 1):
        val = str(cell.value or "").strip().upper()
        if val == "TANGGAL":
            in_staff_area = True
            continue
        if not in_staff_area:
            continue
        name = str(cell.value or "").strip()
        if name:
            # Try to get role from row above
            role = ""
            if header_row > 1:
                above_val = ws.cell(row=header_row - 1, column=col_idx).value
                if above_val:
                    role = str(above_val).strip()
            staff_cols.append(
                {
                    "col": col_idx,
                    "name": name,
                    "role": role,
                }
            )
    return staff_cols


def _parse_shift_cell(text: str | None) -> dict | None:
    """Parse a shift cell value into structured data."""
    if text is None:
        return None
    text = str(text).strip()
    if not text:
        return None

    upper = text.upper()

    if upper == "OFF":
        return {"shiftName": "OFF", "startTime": None, "endTime": None, "status": "off"}
    if upper == "GENERAL":
        return {
            "shiftName": "GENERAL",
            "startTime": None,
            "endTime": None,
            "status": "scheduled",
        }

    # Parse "PAGI (07.30 - 14.30)" or "SORE (13.00 - 21.00)" or "SORE (12.00 - 20.00)"
    m = re.match(
        r"^(\w[\w\s]*?)\s*\((\d{1,2})[\.:](\d{2})\s*[-–]\s*(\d{1,2})[\.:](\d{2})\)$",
        text,
    )
    if m:
        shift_name = m.group(1).strip().upper()
        start_time = f"{m.group(2).zfill(2)}:{m.group(3)}"
        end_time = f"{m.group(4).zfill(2)}:{m.group(5)}"
        return {
            "shiftName": shift_name,
            "startTime": start_time,
            "endTime": end_time,
            "status": "scheduled",
        }

    # Plain shift name without time
    return {
        "shiftName": upper,
        "startTime": None,
        "endTime": None,
        "status": "scheduled",
    }


def parse_excel(file_bytes: bytes, filename: str = "") -> dict:
    """
    Parse an Excel attendance roster file.

    Returns structured data ready for Edge Function importAttendanceSchedule action:
    {
        "source": {"fileName": "...", "month": N, "year": N},
        "staffColumns": [{"rawName": "...", "role": "..."}],
        "rows": [{"date": "YYYY-MM-DD", "rawStaffName": "...", ...}],
        "month": N,
        "year": N
    }
    """
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    ws = wb.active
    if ws is None:
        return {"error": "No active sheet found"}

    sheet_name = str(ws.title).strip()
    logger.info(
        "Parsing Excel: sheet=%s rows=%s cols=%s",
        sheet_name,
        ws.max_row,
        ws.max_column,
    )

    # Find header row
    header_row = _find_header_row(ws)
    if header_row is None:
        return {
            "error": "Format Excel tidak dikenal — tidak menemukan baris header (MINGGU KE, HARI, TANGGAL)."
        }

    # Find staff columns
    staff_cols = _find_staff_columns(ws, header_row)
    if not staff_cols:
        return {"error": "Tidak menemukan kolom staff di header."}

    # Detect month/year from title (first few rows) or dates
    detected_month = 0
    detected_year = 0

    # List of known month names (ID/EN) for precise matching
    _MONTH_NAMES = (
        r"JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER|"
        r"JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER"
    )
    _MONTH_RE = re.compile(rf"({_MONTH_NAMES})\s*(\d{{4}})", re.IGNORECASE)

    for r in range(1, min(header_row, 5) + 1):
        for c in ws[r]:
            val = str(c.value or "").upper()
            # Match bulan + tahun di mana pun dalam sel
            m = _MONTH_RE.search(val)
            if m:
                month_name = m.group(1).strip().lower()
                detected_year = int(m.group(2))
                month_map = {
                    "januari": 1, "january": 1,
                    "februari": 2, "february": 2,
                    "maret": 3, "march": 3,
                    "april": 4,
                    "mei": 5, "may": 5,
                    "juni": 6, "june": 6,
                    "juli": 7, "july": 7,
                    "agustus": 8, "august": 8,
                    "september": 9,
                    "oktober": 10, "october": 10,
                    "november": 11,
                    "desember": 12, "december": 12,
                }
                detected_month = month_map.get(month_name, 0)
                break

    # Parse rows — find date rows (data rows after header)
    rows_data: list[dict] = []
    dates_seen: set[str] = set()

    for row_idx in range(header_row + 1, min(ws.max_row + 1, 200)):
        date_cell = ws.cell(row=row_idx, column=3).value  # Column C = Tanggal

        # Check if this is a date row
        date_val = None
        if isinstance(date_cell, datetime):
            date_val = date_cell
        elif isinstance(date_cell, str):
            try:
                date_val = datetime.strptime(date_cell.strip(), "%Y-%m-%d")
            except ValueError:
                pass

        if date_val is None:
            continue  # Skip separator rows

        date_str = date_val.strftime("%Y-%m-%d")

        # Auto-detect month/year from first date if not found in title
        if not detected_month:
            detected_month = date_val.month
            detected_year = date_val.year

        dates_seen.add(date_str)

        # Parse each staff column
        for sc in staff_cols:
            cell_val = ws.cell(row=row_idx, column=sc["col"]).value
            parsed = _parse_shift_cell(cell_val)
            if parsed is None:
                continue

            rows_data.append(
                {
                    "date": date_str,
                    "rawStaffName": sc["name"],
                    "staffRole": sc.get("role", ""),
                    "shiftName": parsed["shiftName"],
                    "startTime": parsed["startTime"],
                    "endTime": parsed["endTime"],
                    "status": parsed["status"],
                }
            )

    if not rows_data:
        return {
            "error": "Tidak menemukan data jadwal setelah header. Pastikan format Excel benar."
        }

    # Validate: warn if too few staff or dates
    if detected_month and dates_seen:
        actual_dates = len(dates_seen)
        logger.info(
            "Parsed: %d staff × %d dates = %d rows (month=%d, year=%d)",
            len(staff_cols), actual_dates, len(rows_data),
            detected_month, detected_year,
        )
        expected_rows = len(staff_cols) * actual_dates
        if len(rows_data) < expected_rows * 0.5:
            logger.warning(
                "Only %d/%d expected rows — many cells may be empty",
                len(rows_data), expected_rows,
            )

    # Detect month/year from dates if still not found
    if not detected_month and dates_seen:
        first_date = min(dates_seen)
        detected_month = int(first_date.split("-")[1])
        detected_year = int(first_date.split("-")[0])

    # Cross-check: if title month contradicts dates, trust the dates
    # (e.g., title says "JADWAL JUNI 2026" but dates are July 2026)
    if detected_month and dates_seen:
        sample_dates = [d for d in list(dates_seen)[:3]]
        for sd in sample_dates:
            date_month = int(sd.split("-")[1])
            date_year = int(sd.split("-")[0])
            if date_month != detected_month:
                logger.warning(
                    "Title month(%d) differs from dates(%s) — using dates",
                    detected_month, sd,
                )
                detected_month = date_month
                detected_year = date_year
                break

    result: dict[str, Any] = {
        "source": {
            "fileName": filename,
            "sheetName": sheet_name,
            "month": detected_month,
            "year": detected_year,
        },
        "staffColumns": [
            {"rawName": s["name"], "role": s.get("role", "")}
            for s in staff_cols
        ],
        "rows": rows_data,
        "month": detected_month,
        "year": detected_year,
        "summary": {
            "totalRows": len(rows_data),
            "uniqueDates": len(dates_seen),
            "uniqueStaff": len(staff_cols),
            "dateRange": (
                min(dates_seen) + " s/d " + max(dates_seen)
                if dates_seen
                else ""
            ),
        },
    }

    return result


# ─── Edge Function Caller ────────────────────────────────────────


async def call_import_schedule(
    http_client: Any,
    supabase_url: str,
    anon_key: str,
    parsed_data: dict,
    chunk_size: int = 50,
) -> dict:
    """
    Send parsed schedule data to the Edge Function for database import.
    Splits large payloads into chunks to avoid server memory issues.

    Returns the aggregated response from all chunks.
    """
    import httpx
    import asyncio

    url = f"{supabase_url}/functions/v1/yumi-ai"
    rows = parsed_data.get("rows", [])
    total_rows = len(rows)
    headers = {
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
    }

    if total_rows <= chunk_size:
        # Small payload — send as-is (one request)
        async with httpx.AsyncClient(timeout=120) as client:
            payload = {
                "action": "importAttendanceSchedule",
                "parsedData": parsed_data,
            }
            resp = await client.post(url, headers=headers, json=payload)
            if not resp.is_success:
                error_body = resp.text[:500]
                logger.error("Import failed (single): HTTP %d - %s", resp.status_code, error_body)
                return {"error": f"Edge Function error ({resp.status_code}): {error_body}"}
            return resp.json()

    # Large payload — split into chunks
    logger.info("Splitting %d rows into chunks of %d", total_rows, chunk_size)
    aggregated = {
        "success": True,
        "summary": {
            "totalRows": total_rows,
            "insertedRows": 0,
            "skippedRows": 0,
            "uniqueDates": 0,
            "matchedStaff": 0,
            "createdStaff": 0,
            "staffDetails": {"matched": [], "created": []},
            "month": parsed_data.get("month", 0),
            "year": parsed_data.get("year", 0),
            "sourceFile": (parsed_data.get("source", {}) or {}).get("fileName", ""),
        },
        "chunks": [],
    }

    base_data = {k: v for k, v in parsed_data.items() if k != "rows"}

    for i in range(0, total_rows, chunk_size):
        chunk = rows[i : i + chunk_size]
        chunk_payload = {
            "action": "importAttendanceSchedule",
            "parsedData": {**base_data, "rows": chunk},
            "skipDelete": i > 0,  # only first chunk clears the month
        }

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(url, headers=headers, json=chunk_payload)
            if not resp.is_success:
                error_body = resp.text[:500]
                logger.error("Import chunk %d failed: HTTP %d - %s", i // chunk_size + 1, resp.status_code, error_body)
                aggregated["chunks"].append({
                    "from": i,
                    "to": i + len(chunk) - 1,
                    "status": "error",
                    "error": error_body,
                })
                continue  # skip this chunk, try next
            result = resp.json()

        aggregated["chunks"].append(
            {
                "from": i,
                "to": i + len(chunk) - 1,
                "status": "ok" if result.get("success") else "error",
                "inserted": (result.get("summary") or {}).get("insertedRows", 0),
            }
        )

        if result.get("success"):
            s = result.get("summary", {})
            aggregated["summary"]["insertedRows"] += s.get("insertedRows", 0)
            aggregated["summary"]["skippedRows"] += s.get("skippedRows", 0)
            aggregated["summary"]["uniqueDates"] = max(
                aggregated["summary"]["uniqueDates"], s.get("uniqueDates", 0)
            )
            aggregated["summary"]["matchedStaff"] += s.get("matchedStaff", 0)
            aggregated["summary"]["createdStaff"] += s.get("createdStaff", 0)
            sd = s.get("staffDetails", {})
            aggregated["summary"]["staffDetails"]["matched"].extend(
                sd.get("matched", [])
            )
            aggregated["summary"]["staffDetails"]["created"].extend(
                sd.get("created", [])
            )
        else:
            aggregated["chunks"][-1]["error"] = result.get("error", "Unknown error")

        # Brief pause between chunks to let server breathe
        await asyncio.sleep(0.2)

    total_inserted = aggregated["summary"]["insertedRows"]
    error_chunks = [c for c in aggregated["chunks"] if c["status"] == "error"]

    logger.info(
        "Import complete: %d/%d rows inserted in %d chunks (%d errors)",
        total_inserted,
        total_rows,
        len(aggregated["chunks"]),
        len(error_chunks),
    )

    if error_chunks and total_inserted == 0:
        # All chunks failed — return first error
        aggregated["error"] = error_chunks[0].get("error", "Unknown error")
        aggregated["success"] = False

    return aggregated
