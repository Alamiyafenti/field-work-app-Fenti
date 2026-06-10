# Field Work Reporting System

A full-stack, mobile-first web application for managing field work reports with automatic cost calculations and Excel export capabilities.

## 📋 Features

✅ **Public Employee Portal**
- Simple report submission (no login required)
- Mobile-optimized interface
- Offline support with local draft saving
- Auto-calculation of work hours and day of week

✅ **Manager Panel** (Protected)
- Username/password access
- Review pending reports
- Edit report details
- Enter cost data with automatic calculations
- Approve and finalize reports

✅ **Reports & Analytics**
- Calendar view of reports
- Daily summaries (hours, workers, costs)
- Excel export by project and month
- Cost breakdown with VAT

✅ **Mobile-First Design**
- Responsive layout for all screen sizes
- Large touch-friendly buttons
- Numeric keyboards for number inputs
- Fast loading and offline support

## 🛠 Tech Stack

- **Frontend**: React 18 + TailwindCSS + Axios
- **Backend**: Node.js + Express
- **Database**: sql.js (SQLite compiled to JavaScript)
- **Excel Export**: ExcelJS
- **Deployment Ready**: No external database server required

## 📁 Project Structure

```
field-work-app/
├── frontend/                 # React application
│   ├── src/
│   │   ├── pages/           # Page components
│   │   │   ├── Dashboard.js
│   │   │   ├── ReportForm.js
│   │   │   ├── Manager.js
│   │   │   └── Reports.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── postcss.config.js
│
├── backend/                  # Express API
│   ├── server.js            # Main server file
│   ├── db.js                # sql.js initialization and persistence
│   ├── middleware.js        # Authentication middleware
│   ├── package.json
│   └── .env.example

```

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- Git

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env with your configuration
# DB_PATH=./field_work.db
# PORT=5000
# MANAGER_USERNAME=admin
# MANAGER_PASSWORD=admin123
```

#### Edit `backend/.env` file

```
DB_PATH=./field_work.db

PORT=5000
NODE_ENV=development

MANAGER_USERNAME=admin
MANAGER_PASSWORD=admin123
```

#### Start Backend Server

```bash
# Development (with hot reload)
npm run dev

# Production
npm start

# Server runs on http://localhost:5000
```

The database file is created automatically at `backend/field_work.db`.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file (optional, for custom API URL)
echo REACT_APP_API_URL=http://localhost:5000 > .env

# Start development server
npm start

# App opens on http://localhost:3000
```

## 📱 Application Pages

### 1. **Dashboard** (`/`)
- Summary: Total reports, hours, and costs for today
- Recent reports list
- Auto-refreshes every 30 seconds

### 2. **New Report** (`/report`)
- Employee report submission form
- Fields: Project, Client, Date, Location, Time, Workers
- **Offline Support**: Drafts saved to localStorage
- Validation on both client and server

### 3. **Manager Panel** (`/manager`)
- Access with username and password
- List of pending reports
- Edit and review report details
- Enter cost data with live calculations
- Approve and finalize reports

### 4. **Reports** (`/reports`)
- Calendar view by month
- Day-click to see reports
- Daily summaries
- Excel export by project and month

## 🔒 Manager Access

Single authentication method:

### Username & Password
- Navigate to Manager Panel
- Enter credentials from `.env`
- Default username: `admin`
- Default password: `admin123`

## 💾 Database Schema

### `reports` table
```sql
id (PK)
project_name
client
date
day (auto-calculated: Monday, Tuesday, etc.)
location
start_time
end_time
workers (stored as JSON)
worker_count
status (pending/approved)
created_at
updated_at
```

### `costs` table
```sql
id (PK)
report_id (FK)
hourly_rate
distance_km
food_cost
travel_cost
final_cost
final_cost_vat (with 17% VAT)
created_at
updated_at
```

## 🔧 API Endpoints

### Public Endpoints

```
GET /dashboard
  → Returns today's summary and recent reports

POST /reports
  → Create new report
  Body: {
    project_name, client, date, location,
    start_time, end_time, worker_count, workers
  }
```

### Manager Endpoints (Protected)

```
GET /manager/reports?status=pending
  → List pending/approved reports

GET /manager/reports/:id
  → Get report details with calculations

PUT /manager/reports/:id
  → Update report, add costs, and approve
  Body: {
    hourly_rate, distance_km, food_cost, travel_cost, status
  }

GET /manager/reports-by-date?date=YYYY-MM-DD
  → Get all reports for a specific date

GET /manager/export?project=NAME&month=YYYY-MM
  → Export to Excel (returns .xlsx file)
```

## 📊 Excel Export Format

Generated file includes:
- Date, Day, Workers, Hours, Location
- Cost breakdown (Hourly Rate, Labor, Distance, Food, Travel)
- Final Cost (without VAT and with 17% VAT)
- Monthly totals row

## 🌐 Mobile Optimization

- **Responsive Layout**: Works perfectly on phones, tablets, and desktops
- **Touch-Friendly**: Large buttons and inputs for easy mobile use
- **Numeric Keyboards**: Number inputs trigger numeric keyboard on mobile
- **Offline Support**: Reports saved locally when offline
- **Fast Loading**: Optimized CSS and minimal JavaScript bundles

## 🧪 Testing

### Test Employee Flow
1. Go to `http://localhost:3000/report`
2. Fill in form with test data
3. Submit report (status: pending)

### Test Manager Flow
1. Go to `http://localhost:3000/manager`
2. Enter username/password (default: `admin` / `admin123`)
3. Select a pending report
4. Enter cost data
5. Click "Approve & Save"

### Test Excel Export
1. Go to `/reports`
2. Select a project and month
3. Click "Download Excel"
4. File downloads as `ProjectName_YYYY-MM.xlsx`

## 🔐 Security Notes

- **Manager Access**: Simple username/password protection (suitable for internal use)
- **Input Validation**: All inputs validated on frontend and backend
- **CORS**: Configured for cross-origin requests (adjust in production)
- **Environment Variables**: Sensitive data in `.env` (never commit)

### For Production:
- Use HTTPS
- Implement proper authentication (JWT, OAuth, etc.)
- Add rate limiting
- Use environment-specific configs
- Enable HTTPS redirects

## 🚨 Troubleshooting

### Backend can't access database file
```bash
# Verify DB path in backend/.env
DB_PATH=./field_work.db

# If file is corrupted, delete and restart backend
rm -f backend/field_work.db
```

### CORS errors
- Check that frontend API URL is correct in `.env`
- Verify backend is running on configured port
- Check that CORS is enabled in `backend/server.js`

### Reports not showing in calendar
- Ensure database is populated with test data
- Check that reports have `status = 'approved'`
- Verify date format is correct (YYYY-MM-DD)

### Excel export fails
- Ensure ExcelJS is installed: `npm install exceljs`
- Check that reports exist for selected month/project
- Clear browser cache and try again

## 📈 Feature Enhancements (Future)

- User authentication system
- Photo attachments for reports
- GPS location tracking
- Real-time notifications
- Advanced analytics dashboard
- Mobile app (React Native)
- Integration with accounting software

## 📝 Environment Variables Reference

```env
# Database
DB_PATH=./field_work.db

# Server
PORT=5000
NODE_ENV=development

# Manager Access
MANAGER_USERNAME=admin
MANAGER_PASSWORD=admin123

# Frontend (in frontend/.env)
REACT_APP_API_URL=http://localhost:5000
```

## 📞 Support

For issues or questions:
1. Check the Troubleshooting section
2. Review API endpoint documentation
3. Check browser console for errors
4. Verify `backend/field_work.db` exists and is writable
5. Check backend server logs

## 📄 License

Created for field work management and reporting.

---

**Happy reporting! 📋✨**
#   f i e l d - w o r k - a p p  
 