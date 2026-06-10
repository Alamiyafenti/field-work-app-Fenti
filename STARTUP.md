# Installation & Startup Guide

## 🎯 Quick Start (Choose One Path)

### Path A: Automated Setup (Recommended for Windows)

1. **Open PowerShell** as Administrator
2. **Navigate to project folder**
3. **Run setup script:**
   ```powershell
   .\setup.ps1
   ```
4. **Follow prompts** to enter credentials
5. Done! Follow final instructions to start servers

### Path B: Automated Setup (Mac/Linux)

1. **Open Terminal**
2. **Navigate to project folder**
3. **Run setup script:**
   ```bash
   bash setup.sh
   ```
4. **Follow prompts**
5. Done! Follow final instructions to start servers

### Path C: Manual Setup (All Platforms)

Follow these steps exactly:

## Step 1: Setup Backend

```bash
# Navigate to backend folder
cd backend

# Install dependencies
npm install

# Create configuration file
# Windows: Use Notepad
# Mac/Linux: Use nano or vim
# Create file: backend/.env

# Add this content:
DB_PATH=./field_work.db

PORT=5000
NODE_ENV=development

MANAGER_USERNAME=admin
MANAGER_PASSWORD=admin123

# Save the file, then run:
npm run dev
```

**✓ Backend is now running on http://localhost:5000**
**✓ Database is automatically created and stored in field_work.db**

## Step 2: Setup Frontend

```bash
# Open NEW terminal/PowerShell window
# Navigate to frontend folder
cd frontend

# Install dependencies
npm install

# Start development server
npm start

# Browser will open automatically to http://localhost:3000
```

**✓ Frontend is now running on http://localhost:3000**

## ✅ Verification Checklist

- [ ] Backend terminal shows: "Server running on port 5000"
- [ ] Frontend terminal shows: "Compiled successfully!"
- [ ] Browser opened to http://localhost:3000
- [ ] Dashboard page loaded with "Today's Summary"
- [ ] Navigation menu visible at top

## 🧪 Test the Application

### 1. Create a Report

1. Go to **http://localhost:3000/report**
2. Fill in the form:
   - **Project Name:** Test Project
   - **Client:** Client A
   - **Date:** Today's date
   - **Location:** Test Location
   - **Start Time:** 08:00
   - **End Time:** 17:00
   - **Workers:** John, Jane
3. Click **"Submit Report"**
4. Should see: "Report submitted successfully!"

### 2. View as Manager

1. Go to **http://localhost:3000/manager**
2. Click **"Access with PIN"**
3. Enter PIN: **1234**
4. Click **"Access Manager Panel"**
5. Should see your pending report
6. Click on report to view details
7. Enter costs:
   - Hourly Rate: 100
   - Distance: 50
   - Food Cost: 100
   - Travel Cost: 50
8. Watch costs calculate automatically
9. Click **"✓ Approve & Save Report"**

### 3. View Report in Calendar

1. Go to **http://localhost:3000/reports**
2. Should still be logged in as manager
3. Calendar shows current month
4. Click on today's date
5. Should see your approved report
6. Daily summary shows totals

### 4. Export to Excel

1. In Reports page
2. Select **Project:** Test Project
3. Select **Month:** Current month
4. Click **"📥 Download Excel"**
5. File downloads as `Test project_YYYY-MM.xlsx`
6. Open in Excel/Google Sheets to verify

## 🆚 Default Login Credentials

When you see the Manager login screen:

**Option 1 - Use PIN:**
- PIN: `1234`

**Option 2 - Use Secret Key:**
- Key: `your_secret_key_here`

To change these values, edit `backend/.env` and restart backend server.

## 📱 Test Mobile View

In your browser:
1. Press **F12** to open Developer Tools
2. Click **mobile device icon** (top-left of inspector)
3. Select **iPhone 12 Pro** or any mobile preset
4. Refresh the page
5. Form should adapt to mobile layout with:
   - Larger buttons
   - Full-width inputs
   - Numeric keyboards for numbers

## 🔌 Offline Testing

### Save a Report Draft (Offline)

1. Go to **http://localhost:3000/report**
2. Stop backend server (Ctrl+C in backend terminal)
3. Fill in form completely
4. Click **"Submit Report"**
5. Should see: "Report saved as draft"
6. Form values saved to browser
7. Restart backend (npm run dev)
8. Reload page
9. Click **"Load"** on the draft card
10. Form repopulates with saved data
11. Click submit again - now works online

## ⚠️ Troubleshooting

### "Cannot access database"
```
✓ Check: Is database file field_work.db created?
✓ Check: Is backend .env file correctly configured?

Solution:
- Delete backend/field_work.db (will be recreated)
- Restart backend server: npm run dev
- New database will be automatically created
```

### "Port 5000 already in use"
```
Solution:
- Change PORT in backend/.env to 5001
- Or close other app using port 5000
- Restart backend server
```

### "npm install fails"
```
Solution:
- Delete node_modules folder
- Delete package-lock.json
- Run: npm cache clean --force
- Run: npm install again
```

### "Cannot find React module"
```
Solution:
- Make sure you're IN the frontend folder
- Make sure you ran: npm install
- Try: npm install react react-dom
```

### "Module not found: 'express'"
```
Solution:
- Make sure you're IN the backend folder
- Make sure you ran: npm install
- Restart server: npm run dev
```

### "Blank page loads"
```
Solution:
- Open Developer Console (F12)
- Check for red errors
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Check: Is backend running? (should have "Server running" message)
```

## 🌐 What Each Page Does

| Page | URL | Access | Purpose |
|------|-----|--------|---------|
| Dashboard | / | Public | See today's stats |
| New Report | /report | Public | Submit work report |
| Manager | /manager | Protected* | Approve reports |
| Reports | /reports | Protected* | View & export data |

*Protected = Need PIN or Secret Key

## 📝 File Locations Reference

```
Your current folder:
field-work-app/

Important files:
- backend/server.js          ← API server code
- backend/.env              ← App and database config
- frontend/src/App.js       ← Main frontend code
- backend/field_work.db     ← Local database file

Instructions:
- README.md                 ← Full documentation
- QUICKSTART.md             ← Quick reference
- DEPLOYMENT.md             ← Deploy to production
```

## 🎮 Typical User Journey

### Employee Flow:
1. Opens http://localhost:3000
2. Clicks "New Report"
3. Fills form
4. Submits (becomes "pending")
5. Report visible on Dashboard

### Manager Flow:
1. Opens http://localhost:3000/manager
2. Enters PIN: 1234
3. Sees pending report
4. Clicks to open
5. Enters cost data
6. Clicks approve
7. Report status changes to "approved"

### Admin/Export Flow:
1. Stays in Manager panel
2. Clicks "Reports"
3. Views calendar
4. Clicks export button
5. Downloads Excel file

## 💡 Tips & Tricks

- **Mobile Testing:** Resize browser window to test responsive design
- **Database Check:** 
  ```bash
   ls backend/field_work.db
  ```
- **Clear Cache:** Ctrl+Shift+Delete in browser
- **Hide sidebar:** Press F11 for full-screen testing

## 📞 Still Having Issues?

1. Check error messages in terminal (backend/frontend)
2. Check browser console (F12 → Console tab)
3. Verify all files exist in their folders
4. Make sure ports 5000 and 3000 are not used by other apps
5. Review full documentation in README.md

## ✅ Success!

You should now see:
- ✅ Dashboard page loads
- ✅ Can create reports
- ✅ Manager can approve
- ✅ Excel export works
- ✅ Mobile view responsive

**Your field work reporting system is ready to use!** 🎉
