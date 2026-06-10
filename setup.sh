#!/usr/bin/env bash

# Field Work Reporting System - Setup Script
# Run this script to automatically set up the entire application

set -e

echo "================================"
echo "Field Work Reporting System"
echo "Setup Script"
echo "================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Backend setup
echo "Setting up backend..."
cd backend

npm install --silent

# Create .env file
cat > .env << EOF
DB_PATH=./field_work.db

PORT=5000
NODE_ENV=development

MANAGER_USERNAME=admin
MANAGER_PASSWORD=admin123
EOF

echo "✅ Backend configured"
echo ""

# Frontend setup
cd ../frontend

npm install --silent

echo "✅ Frontend configured"
echo ""

echo "================================"
echo "✅ Setup Complete!"
echo "================================"
echo ""
echo "To start the application:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd backend"
echo "  npm run dev"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd frontend"
echo "  npm start"
echo ""
echo "Then open: http://localhost:3000"
echo ""
echo "Default Manager Username: admin"
echo "Default Manager Password: admin123"
echo ""
echo "Note: Database is stored locally in field_work.db"
