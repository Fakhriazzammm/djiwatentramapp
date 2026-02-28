# OCR Service

Python service for receipt OCR using Google Gemini API.

## Setup

1. Install dependencies:
```bash
cd packages/ocr-service
pip install -r requirements.txt
```

2. Set environment variable:
```bash
export GEMINI_API_KEY=your_api_key_here
```

3. Run the service:
```bash
python main.py
```

Service will run on http://localhost:8001

## API Endpoints

### POST /ocr
General OCR scan for any image.

### POST /ocr/receipt
Specialized OCR for receipt/invoice scanning with enhanced prompt.
