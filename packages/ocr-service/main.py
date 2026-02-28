"""
OCR Service for Receipt Scanning
Uses Google Gemini API for accurate OCR
"""
import os
import re
import json
import base64
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="OCR Service")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent"


class OCRRequest(BaseModel):
    image: str  # base64 data URL
    prompt: Optional[str] = None


class OCRResponse(BaseModel):
    success: bool
    type: str
    data: Optional[dict]
    raw_text: str
    confidence: float
    error: Optional[str] = None


def extract_json_from_response(text: str) -> Optional[dict]:
    """Extract JSON from Gemini response"""
    # Try to find JSON in the response
    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass

    # Try to parse entire response as JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def get_ocr_prompt(custom_prompt: Optional[str] = None) -> str:
    """Get OCR prompt"""
    if custom_prompt:
        return custom_prompt

    return """Kamu adalah sistem OCR yang canggih untuk membaca struk belanja.

Tugasmu:
1. Baca SEMUA teks dari gambar struk/kwitansi dari atas ke bawah
2. Identifikasi jenis transaksi: expense (pengeluaran) atau income/income (pemasukan)
3. Ekstrak data: amount (total), items (nama, quantity, price), category, payment method, notes

PENTING:
- Baca SEMUA item sampai selesai, jangan berhenti di tengah
- Amount harus angka numerik tanpa format (contoh: 50000, bukan 50.000)
- Kembalikan HANYA JSON valid tanpa markdown block

Format:
{
  "type": "expense",
  "data": {
    "amount": 50000,
    "items": [{"name": "Nasi Goreng", "quantity": 2, "price": 15000}],
    "category": "makanan",
    "paymentMethod": "cash",
    "notes": "Struk No. 123"
  },
  "confidence": 0.95
}

Baca struk ini lengkap dari atas ke bawah."""


@app.get("/")
async def root():
    return {"service": "OCR Service", "status": "running"}


@app.post("/ocr", response_model=OCRResponse)
async def ocr_scan(request: OCRRequest):
    """Scan receipt image using Gemini API"""

    if not GEMINI_API_KEY:
        return OCRResponse(
            success=False,
            type="unknown",
            data=None,
            raw_text="",
            confidence=0,
            error="GEMINI_API_KEY not configured"
        )

    try:
        # Extract base64 data from data URL
        if "," in request.image:
            base64_data = request.image.split(",", 1)[1]
        else:
            base64_data = request.image

        # Prepare request to Gemini API
        prompt = get_ocr_prompt(request.prompt)

        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": base64_data
                            }
                        },
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2000,
                "responseMimeType": "text/plain"
            }
        }

        # Call Gemini API
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{GEMINI_API_URL}?key={GEMINI_API_KEY}",
                headers={"Content-Type": "application/json"},
                json=payload
            )

            if response.status_code != 200:
                error_text = response.text
                print(f"Gemini API Error {response.status_code}: {error_text}")
                return OCRResponse(
                    success=False,
                    type="unknown",
                    data=None,
                    raw_text="",
                    confidence=0,
                    error=f"API Error: {response.status_code}"
                )

            result = response.json()

            # Extract response text
            try:
                content = result["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError, TypeError) as e:
                print(f"Failed to extract content: {e}, result: {result}")
                return OCRResponse(
                    success=False,
                    type="unknown",
                    data=None,
                    raw_text="",
                    confidence=0,
                    error=f"Invalid response format: {str(e)}"
                )

            # Parse JSON response
            parsed_data = extract_json_from_response(content)

            if parsed_data:
                return OCRResponse(
                    success=True,
                    type=parsed_data.get("type", "unknown"),
                    data=parsed_data.get("data", {}),
                    raw_text=content,
                    confidence=parsed_data.get("confidence", 0.5),
                    error=None
                )
            else:
                # Could not parse JSON, return raw text
                return OCRResponse(
                    success=False,
                    type="unknown",
                    data=None,
                    raw_text=content,
                    confidence=0.3,
                    error="Could not parse structured data from response"
                )

    except Exception as e:
        print(f"OCR Error: {e}")
        return OCRResponse(
            success=False,
            type="unknown",
            data=None,
            raw_text="",
            confidence=0,
            error=str(e)
        )


@app.post("/ocr/receipt")
async def ocr_receipt(request: OCRRequest):
    """Specialized endpoint for receipt scanning with enhanced prompt"""

    receipt_prompt = """Kamu adalah pakar OCR struk belanja Indonesia.

ANALISIS STRUK:
1. Baca DARI ATAS KE BAWAH - jangan lewatkan baris manapun
2. Setiap item: nama barang, jumlah (qty), harga satuan, subtotal
3. Total: cari kata "TOTAL", "JUMLAH", atau angka terbesar di bagian bawah
4. Tanggal: format DD/MM/YY atau MM-DD-YY
5. Toko/merchant: nama di header struk
6. Payment method: cash, qris, transfer, kartu

Kategorikan:
- Expense/Pengeluaran: belanja barang, bayar tagihan, belanja bahan
- Income/Pemasukan: struk hasil penjualan (toko/restoran kamu)

OUTPUT FORMAT (JSON only, no markdown):
{
  "type": "expense",
  "data": {
    "amount": 85000,
    "items": [
      {"name": "Beras 5kg", "quantity": 1, "price": 65000},
      {"name": "Telur 1kg", "quantity": 2, "price": 10000}
    ],
    "category": "bahan_baku",
    "description": "Belanja di Toko Berkah",
    "paymentMethod": "qris",
    "notes": "23 Feb 2025, Struk #0041"
  },
  "confidence": 0.95
}

Baca struk ini dengan teliti. Pastikan ambil SEMUA item dan total yang benar."""

    # Use the general OCR with specialized prompt
    return await ocr_scan(OCRRequest(image=request.image, prompt=receipt_prompt))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    print(f"Starting OCR Service on port {port}...")
    print(f"Gemini API Key configured: {bool(GEMINI_API_KEY)}")
    uvicorn.run(app, host="0.0.0.0", port=port)
