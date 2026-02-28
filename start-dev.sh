#!/usr/bin/env bash
# Development startup script - runs all services together

echo "🚀 Starting YUMI POS Development..."
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# Check if Python dependencies are installed
echo "📦 Checking Python OCR service dependencies..."
cd "$PROJECT_ROOT/packages/ocr-service"

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found!"
    exit 1
fi

# Create venv if not exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python -m venv venv
fi

# Activate venv and install dependencies
echo "Installing Python dependencies..."
source venv/bin/activate
pip install -q -r requirements.txt

# Go back to project root
cd "$PROJECT_ROOT"

echo "✅ Python dependencies OK"
echo ""
echo "🌟 Starting services..."
echo ""

# Function to kill processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."

    # Kill Python OCR service
    if [ ! -z "$OCR_PID" ]; then
        kill $OCR_PID 2>/dev/null
    fi

    # Also kill any process on port 8001
    lsof -ti:8001 | xargs kill -9 2>/dev/null

    echo "✅ All services stopped"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check port 8001 availability
if lsof -Pi :8001 -sTCP > /dev/null 2>&1; then
    echo "⚠️  Port 8001 is already in use. Killing existing process..."
    lsof -ti:8001 | xargs kill -9 2>/dev/null
    sleep 1
fi

# Start Python OCR Service in background
echo "🔧 Starting Python OCR Service on port 8001..."
cd "$PROJECT_ROOT/packages/ocr-service"

# Activate venv and start service
source venv/bin/activate
python main.py &
OCR_PID=$!

# Wait a moment for the service to start
sleep 3

# Check if Python service is running
if ps -p $OCR_PID > /dev/null; then
    echo "✅ Python OCR Service started (PID: $OCR_PID)"
else
    echo "❌ Failed to start Python OCR Service"
    exit 1
fi

cd "$PROJECT_ROOT"

# Start main development (Turbo)
echo ""
echo "🚀 Starting Turbo Dev Server..."
echo ""

# Run turbo dev and forward cleanup signal
turbo dev &
TURBO_PID=$!

# Wait for turbo
wait $TURBO_PID
