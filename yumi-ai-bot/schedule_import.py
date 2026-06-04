"""
Yumi GM Agent — Schedule Import Module

Parses Excel (.xlsx) attendance roster files and sends structured data
to the Yumi AI Edge Function for database insertion.

Supported formats:
- Matrix format: columns = staff names, rows = dates with shift values
- Auto-detects: staff columns, date column, week/hari columns
"""

import io
import re
import logging
from datetime import datetime
from typing import Any

import openpyxl

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
    for r in range(1, min(header_row, 5) + 1):
        for c in ws[r]:
            val = str(c.value or "").upper()
            # Match "JADWAL JUNI 2026" or "JADWAL MEI 2026"
            m = re.search(
                r"JADWAL\s+(\w+)\s+(\d{4})", val
            )
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

    # Detect month/year from dates if still not found
    if not detected_month and dates_seen:
        first_date = min(dates_seen)
        detected_month = int(first_date.split("-")[1])
        detected_year = int(first_date.split("-")[0])

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
) -> dict:
    """
    Send parsed schedule data to the Edge Function for database import.

    Returns the response from the Edge Function.
    """
    import httpx

    url = f"{supabase_url}/functions/v1/yumi-ai"
    payload = {
        "action": "importAttendanceSchedule",
        "parsedData": parsed_data,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {anon_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()
