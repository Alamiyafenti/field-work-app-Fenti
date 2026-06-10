# Field Work Reporting System - Windows Setup Script
# Run this script in PowerShell to automatically set up the application

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Field Work Reporting System" -ForegroundColor Cyan
Write-Host "Windows Setup Script" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 16+ first." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Backend setup
Write-Host "Setting up backend..." -ForegroundColor Yellow
Push-Location backend

npm install --silent

# Create .env file
$envContent = @"
DB_PATH=./field_work.db

PORT=5000
NODE_ENV=development

MANAGER_USERNAME=admin
MANAGER_PASSWORD=admin123
"@

$envContent | Out-File -FilePath .env -Encoding UTF8

Write-Host "✅ Backend configured" -ForegroundColor Green
Write-Host ""

# Frontend setup
Write-Host "Setting up frontend..." -ForegroundColor Yellow
Pop-Location
Push-Location frontend

npm install --silent

Write-Host "✅ Frontend configured" -ForegroundColor Green
Write-Host ""

Pop-Location

Write-Host "================================" -ForegroundColor Green
Write-Host "✅ Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the application:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Terminal 1 (Backend):" -ForegroundColor Yellow
Write-Host "  cd backend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Terminal 2 (Frontend):" -ForegroundColor Yellow
Write-Host "  cd frontend"
Write-Host "  npm start"
Write-Host ""
Write-Host "Then open: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Default Manager Username: admin" -ForegroundColor Cyan
Write-Host "Default Manager Password: admin123" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: Database is stored locally in field_work.db" -ForegroundColor Yellow
