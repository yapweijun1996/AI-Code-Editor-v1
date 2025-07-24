@echo off
echo "Starting AI Code Editor setup..."

:: Install backend dependencies
echo "Installing backend dependencies..."
cd backend
npm install
cd ..

:: Install pm2 globally
echo "Installing pm2..."
npm install pm2 -g

:: Start the server with pm2
echo "Starting server with pm2..."
pm2 start backend/index.js --name "ai-code-editor"

:: Configure pm2 to auto-start on boot
echo "Configuring auto-start with pm2..."
pm2 startup
pm2 save

echo "Setup complete. The AI Code Editor is running on http://localhost:3333"