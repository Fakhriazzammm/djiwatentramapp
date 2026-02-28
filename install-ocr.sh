#!/usr/bin/env bash
# Install Python OCR Service dependencies

echo "📦 Installing Python OCR Service dependencies..."
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

cd "$PROJECT_ROOT/packages/ocr-service"

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies from requirements.txt..."
pip install -r requirements.txt

echo "✅ Python OCR Service dependencies installed!"
echo ""
echo "To start all services, run:"
echo "  ./start-dev.sh"
