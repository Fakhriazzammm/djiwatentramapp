@echo off
echo Installing Python OCR Service dependencies...
echo.

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%

cd /d "%PROJECT_ROOT%\packages\ocr-service"

if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Installing dependencies from requirements.txt...
call venv\Scripts\activate
pip install -r requirements.txt

echo.
echo Python OCR Service dependencies installed!
echo.
echo To start all services, run: start-dev.bat
