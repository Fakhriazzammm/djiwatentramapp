@echo off
echo Starting YUMI POS Development...
echo.

REM Get project root
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%

cd /d "%PROJECT_ROOT%"

REM Check Python dependencies
echo Checking Python OCR service dependencies...
cd "%PROJECT_ROOT%\packages\ocr-service"

if not exist "requirements.txt" (
    echo ERROR: requirements.txt not found!
    exit /b 1
)

REM Create venv if not exists
if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate venv and install dependencies
echo Installing Python dependencies...
call venv\Scripts\activate
pip install -q -r requirements.txt

cd /d "%PROJECT_ROOT%"

echo Python dependencies OK
echo.
echo Starting services...
echo.

REM Check and kill existing processes on port 8001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo Killing existing process on port 8001...
    taskkill /F /PID %%a >nul 2>&1
)

REM Start Python OCR Service in background
echo Starting Python OCR Service on port 8001...
cd "%PROJECT_ROOT%\packages\ocr-service"
start /B python main.py
cd /d "%PROJECT_ROOT%"

REM Wait for service to start
timeout /t 3 /nobreak >nul

echo Python OCR Service started
echo.
echo Starting Turbo Dev Server...
echo.

REM Start main development
turbo dev
