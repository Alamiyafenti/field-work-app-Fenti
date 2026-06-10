# Quick Start Guide

Complete setup in 3 minutes! No database setup required.

## Step 1: Backend Setup (1 min)

```bash
cd backend

npm install

# Copy and edit .env
cp .env.example .env

npm run dev
# Backend running on port 5000
# Database automatically created as field_work.db
```

## Step 2: Frontend Setup (1 min)

In a NEW terminal window:

```bash
cd frontend

npm install

npm start
# App opens on http://localhost:3000
```

## Step 3: Test It!

✅ **Create a Report**
- Go to http://localhost:3000/report
- Fill in and submit

✅ **View as Manager**
- Go to http://localhost:3000/manager
- Enter PIN: `1234`
- Approve the report
- View in Reports/Calendar

✅ **Export to Excel**
- In /reports page
- Select project and month
- Click Download Excel

## 🎯 Default Credentials

- **Manager PIN**: 1234
- **Manager Secret Key**: your_secret_key_here

Change these in `backend/.env`

## 🆘 Need Help?

See detailed instructions in [README.md](README.md)
