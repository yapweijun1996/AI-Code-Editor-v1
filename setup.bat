@echo off
echo =================================================
echo AI Code Editor Setup
echo =================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrative permissions confirmed.
) else (
    echo ERROR: This script requires administrative privileges.
    echo Please right-click on setup.bat and select "Run as administrator".
    pause
    exit /b
)

echo.
echo This script will install all necessary dependencies and set up the AI Code Editor.
echo Make sure you have Node.js installed on your system.
echo.
echo Press any key to continue...
pause >nul
echo.

:: Install backend dependencies
echo [1/3] Installing backend dependencies...
cd backend
npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install backend dependencies.
    pause
    exit /b
)
cd ..
echo Backend dependencies installed successfully.
echo.


:: Install pm2 globally
echo [2/3] Installing pm2 process manager globally...
npm install pm2 -g
if %errorlevel% neq 0 (
    echo ERROR: Failed to install pm2.
    pause
    exit /b
)
echo pm2 installed successfully.
echo.

:: Start the server with pm2 and configure auto-start
echo [3/3] Starting server with pm2 and configuring auto-start...

:: Stop any existing process with the same name to ensure a clean start
pm2 stop "ai-code-editor" >nul 2>&1
pm2 delete "ai-code-editor" >nul 2>&1

pm2 start backend/index.js --name "ai-code-editor"
if %errorlevel% neq 0 (
    echo ERROR: Failed to start server with pm2.
    pause
    exit /b
)

echo Configuring pm2 to auto-start on boot...
pm2 startup
pm2 save
if %errorlevel% neq 0 (
    echo WARNING: Failed to configure pm2 auto-start. You may need to run 'pm2 startup' manually.
)

echo.
echo =================================================
echo Setup Complete!
echo =================================================
echo The AI Code Editor backend is now running via pm2.
echo You can access the editor at: http://localhost:3333
echo.
echo To check the server status, run: pm2 status
echo To view logs, run: pm2 logs ai-code-editor
echo.
pause