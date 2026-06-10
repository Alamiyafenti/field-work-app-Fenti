const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { body, validationResult, query } = require('express-validator');
require('dotenv').config();

const { initializeDatabase, getDb, saveDatabase } = require('./db');
const { requireAuthenticatedUser, requireManagerAccess, requireEmployeeAccess } = require('./middleware');
const ExcelJS = require('exceljs');

const app = express();
let db = null;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database on startup
(async () => {
  await initializeDatabase();
  db = getDb();
})();

// Helper function to calculate day of week
function getDayOfWeek(date) {
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return days[new Date(date).getDay()];
}

// Helper function to calculate work hours
function calculateWorkHours(startTime, endTime) {
  if (!startTime || !endTime) {
    return 0;
  }

  const toMinutes = (value) => {
    const [hours, minutes] = String(value).split(':').map((part) => parseInt(part, 10));
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return (hours * 60) + minutes;
  };

  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  let durationMinutes = endMinutes - startMinutes;

  // If end is not after start, treat as an overnight shift (next day).
  if (durationMinutes <= 0) {
    durationMinutes += 24 * 60;
  }

  return durationMinutes / 60;
}

// Helper function to calculate costs
function calculateCosts(workerCount, dailyRate, distanceKm, foodCost, travelCost, projectBonus = 0) {
  const laborCost = workerCount * (dailyRate || 0);
  const distanceCost = (distanceKm || 0) * 1.5; // 1.5 per km
  const totalFoodCost = (foodCost || 0) * workerCount;
  const finalCost = laborCost + distanceCost + totalFoodCost + (travelCost || 0) + (projectBonus || 0);
  const finalCostVat = finalCost * 1.17;

  return {
    labor_cost: parseFloat(laborCost.toFixed(2)),
    distance_cost: parseFloat(distanceCost.toFixed(2)),
    distance_km: distanceKm || 0,
    total_food_cost: parseFloat(totalFoodCost.toFixed(2)),
    project_bonus: parseFloat((projectBonus || 0).toFixed(2)),
    final_cost: parseFloat(finalCost.toFixed(2)),
    final_cost_vat: parseFloat(finalCostVat.toFixed(2)),
  };
}

function calculateProjectBonusForWorkers(workerIds) {
  if (!Array.isArray(workerIds) || workerIds.length === 0) {
    return 0;
  }

  const placeholders = workerIds.map(() => '?').join(',');
  const result = db.exec(
    `SELECT SUM(project_bonus) FROM employees WHERE id IN (${placeholders})`,
    workerIds
  );

  if (!result || result.length === 0 || !result[0].values || result[0].values.length === 0) {
    return 0;
  }

  return Number(result[0].values[0][0]) || 0;
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function isValidTimeValue(value) {
  return /^\d{2}:\d{2}$/.test(String(value || ''));
}

function normalizeWorkerIds(workerIdsRaw) {
  if (!Array.isArray(workerIdsRaw)) {
    return [];
  }

  return workerIdsRaw
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function hasAllCostValues(costValues) {
  return ['daily_rate', 'distance_km', 'food_cost', 'travel_cost'].every((key) => (
    costValues[key] !== null && costValues[key] !== undefined && !Number.isNaN(costValues[key])
  ));
}

function toReportResponse(row) {
  return {
    id: row[0],
    project_name: row[1],
    client: row[2],
    date: row[3],
    day: row[4],
    location: row[5],
    start_time: row[6],
    end_time: row[7],
    workers: row[8],
    worker_count: row[9],
    status: row[10],
    created_at: row[11],
    updated_at: row[12],
    worker_ids: row[13],
    created_by_user_id: row[14],
  };
}

function managerExists() {
  if (!db) {
    return false;
  }

  const result = db.exec("SELECT id FROM users WHERE role = 'manager' AND is_active = 1 LIMIT 1");
  return result.length > 0 && result[0].values.length > 0;
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function normalizeDateRange(startDateRaw, endDateRaw) {
  const startDate = (startDateRaw || '').toString().trim();
  const endDate = (endDateRaw || '').toString().trim();

  if (startDate && !isValidDateString(startDate)) {
    return { error: 'תאריך התחלה אינו תקין' };
  }

  if (endDate && !isValidDateString(endDate)) {
    return { error: 'תאריך סיום אינו תקין' };
  }

  if (startDate && endDate && startDate > endDate) {
    return { error: 'תאריך התחלה חייב להיות קטן או שווה לתאריך הסיום' };
  }

  return { startDate: startDate || null, endDate: endDate || null };
}

function sanitizeAsciiFilenamePart(value) {
  return String(value || '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildAttachmentFilenameHeader(fileName) {
  const safeName = String(fileName || 'export.xlsx').replace(/[\r\n]/g, '');
  const lastDotIndex = safeName.lastIndexOf('.');
  const ext = lastDotIndex > 0 ? safeName.slice(lastDotIndex) : '.xlsx';
  const baseName = lastDotIndex > 0 ? safeName.slice(0, lastDotIndex) : safeName;
  const asciiBase = sanitizeAsciiFilenamePart(baseName) || 'export';
  const asciiFileName = `${asciiBase}${ext}`;
  const encodedUtf8FileName = encodeURIComponent(safeName);

  return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedUtf8FileName}`;
}

// ==================== PUBLIC ENDPOINTS ====================

// GET /setup/status - Check if first manager setup is required
app.get('/setup/status', (req, res) => {
  if (!db) {
    return res.status(503).json({ error: 'Database not initialized' });
  }

  return res.json({
    setup_required: !managerExists(),
  });
});

// POST /setup/manager - Create first manager when database has no manager
app.post(
  '/setup/manager',
  [
    body('full_name').notEmpty().trim(),
    body('serial_id').trim().matches(/^\d{5,10}$/),
    body('phone_number').optional({ checkFalsy: true }).trim().matches(/^\d{7,15}$/),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    if (managerExists()) {
      return res.status(409).json({ error: 'Manager already exists' });
    }

    const fullName = req.body.full_name.trim();
    const serialId = req.body.serial_id.trim();
    const phoneNumber = (req.body.phone_number || '').toString().trim();

    try {
      const existingUser = db.exec('SELECT id FROM users WHERE serial_id = ? LIMIT 1', [serialId]);
      if (existingUser.length > 0 && existingUser[0].values.length > 0) {
        return res.status(409).json({ error: 'User with this serial id already exists' });
      }

      db.run(
        'INSERT INTO users (serial_id, password, role, full_name, phone_number, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [serialId, serialId, 'manager', fullName, phoneNumber || null]
      );

      const managerRow = db.exec('SELECT id, serial_id, role, full_name, phone_number FROM users WHERE serial_id = ? LIMIT 1', [serialId]);
      saveDatabase();

      return res.status(201).json({
        message: 'Manager created successfully',
        user: {
          id: managerRow[0].values[0][0],
          serial_id: managerRow[0].values[0][1],
          role: managerRow[0].values[0][2],
          full_name: managerRow[0].values[0][3],
          phone_number: managerRow[0].values[0][4] || '',
          password: serialId,
        },
      });
    } catch (error) {
      console.error('Setup manager error:', error);
      return res.status(500).json({ error: 'Failed to create manager' });
    }
  }
);

// GET /dashboard - Summary data
app.get('/dashboard', (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    const currentMonth = today.slice(0, 7);

    // Today stats
    const reportsResult = db.exec(
      'SELECT COUNT(*) FROM reports WHERE date = ?',
      [today]
    );
    const reportCount = reportsResult.length > 0 ? reportsResult[0].values[0][0] : 0;

    const dailyReportsResult = db.exec(
      'SELECT start_time, end_time FROM reports WHERE date = ?',
      [today]
    );
    const totalHours = dailyReportsResult.length > 0
      ? dailyReportsResult[0].values.reduce((sum, row) => sum + calculateWorkHours(row[0], row[1]), 0)
      : 0;

    const todayReportRows = db.exec(
      `SELECT r.worker_ids, c.hourly_rate, c.distance_km, c.food_cost, c.travel_cost
       FROM reports r
       LEFT JOIN costs c ON c.report_id = r.id
       WHERE r.date = ?`,
      [today]
    );

    const totalCost = todayReportRows.length > 0
      ? todayReportRows[0].values.reduce((sum, row) => {
          const workerIds = parseWorkerIds(row[0]);
          const projectBonus = calculateProjectBonusForWorkers(workerIds);
          const hourlyRate = Number(row[1]) || 0;
          const distanceKm = Number(row[2]) || 0;
          const foodCost = Number(row[3]) || 0;
          const travelCost = Number(row[4]) || 0;
          const workerCount = workerIds.length || 0;
          const costs = calculateCosts(workerCount, hourlyRate, distanceKm, foodCost, travelCost, projectBonus);
          return sum + costs.final_cost_vat;
        }, 0)
      : 0;

    // Monthly stats
    const monthReportsResult = db.exec(
      "SELECT COUNT(*) FROM reports WHERE strftime('%Y-%m', date) = ?",
      [currentMonth]
    );
    const monthReportCount = monthReportsResult.length > 0 ? monthReportsResult[0].values[0][0] : 0;

    const monthHoursResult = db.exec(
      "SELECT start_time, end_time FROM reports WHERE strftime('%Y-%m', date) = ?",
      [currentMonth]
    );
    const monthTotalHours = monthHoursResult.length > 0
      ? monthHoursResult[0].values.reduce((sum, row) => sum + calculateWorkHours(row[0], row[1]), 0)
      : 0;

    const monthReportRows = db.exec(
      `SELECT r.worker_ids, c.hourly_rate, c.distance_km, c.food_cost, c.travel_cost
       FROM reports r
       LEFT JOIN costs c ON c.report_id = r.id
       WHERE strftime('%Y-%m', r.date) = ?`,
      [currentMonth]
    );

    const monthTotalCost = monthReportRows.length > 0
      ? monthReportRows[0].values.reduce((sum, row) => {
          const workerIds = parseWorkerIds(row[0]);
          const projectBonus = calculateProjectBonusForWorkers(workerIds);
          const hourlyRate = Number(row[1]) || 0;
          const distanceKm = Number(row[2]) || 0;
          const foodCost = Number(row[3]) || 0;
          const travelCost = Number(row[4]) || 0;
          const workerCount = workerIds.length || 0;
          const costs = calculateCosts(workerCount, hourlyRate, distanceKm, foodCost, travelCost, projectBonus);
          return sum + costs.final_cost_vat;
        }, 0)
      : 0;

    // Recent reports
    const recentResult = db.exec(
      `SELECT r.id, r.project_name, r.client, r.date, r.day, r.location,
              r.start_time, r.end_time, r.workers, r.worker_count, r.status
       FROM reports r
       ORDER BY r.created_at DESC LIMIT 8`
    );

    const recentReports = recentResult.length > 0 ? recentResult[0].values.map(row => ({
      id: row[0],
      project_name: row[1],
      client: row[2],
      date: row[3],
      day: row[4],
      location: row[5],
      start_time: row[6],
      end_time: row[7],
      workers: row[8],
      worker_count: row[9],
      status: row[10],
    })) : [];

    res.json({
      today,
      current_month: currentMonth,
      total_reports_today: reportCount,
      total_hours_today: parseFloat(totalHours.toFixed(2)),
      total_cost_today: parseFloat(totalCost.toFixed(2)),
      total_reports_month: monthReportCount,
      total_hours_month: parseFloat(monthTotalHours.toFixed(2)),
      total_cost_month: parseFloat(monthTotalCost.toFixed(2)),
      recent_reports: recentReports,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// POST /auth/login - Simple login for manager and employee
app.post(
  '/auth/login',
  [
    body('serial_id').trim().matches(/^\d{5,10}$/),
    body('password').notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    if (!managerExists()) {
      return res.status(403).json({ error: 'Setup required. Create manager first.' });
    }

    const { serial_id, password } = req.body;
    const result = db.exec(
      'SELECT id, serial_id, role, full_name, is_active, phone_number FROM users WHERE serial_id = ? AND password = ? LIMIT 1',
      [serial_id.trim(), password]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Invalid serial id or password' });
    }

    const row = result[0].values[0];
    if (!row[4]) {
      return res.status(401).json({ error: 'User is not active' });
    }

    return res.json({
      message: 'Login successful',
      user: {
        id: row[0],
        serial_id: row[1],
        role: row[2],
        full_name: row[3],
        phone_number: row[5] || '',
      },
    });
  }
);

// POST /reports - Create a new report (employee only)
app.post(
  '/reports',
  requireEmployeeAccess,
  [
    body('project_name').notEmpty().trim(),
    body('client').notEmpty().trim(),
    body('date').isISO8601(),
    body('location').notEmpty().trim(),
    body('start_time').matches(/^\d{2}:\d{2}$/),
    body('end_time').matches(/^\d{2}:\d{2}$/),
    body('worker_count').isInt({ min: 1 }),
    body('workers').isArray({ min: 1 }),
    body('worker_ids').isArray({ min: 1 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { project_name, client, date, location, start_time, end_time, worker_count, worker_ids } = req.body;

    try {
      if (!project_name || !String(project_name).trim()) {
        return res.status(400).json({ error: 'Project name is required' });
      }

      if (!client || !String(client).trim()) {
        return res.status(400).json({ error: 'Client is required' });
      }

      if (!isValidIsoDate(date)) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      if (!location || !String(location).trim()) {
        return res.status(400).json({ error: 'Location is required' });
      }

      if (!isValidTimeValue(start_time) || !isValidTimeValue(end_time)) {
        return res.status(400).json({ error: 'Invalid time format' });
      }

      if (start_time === end_time) {
        return res.status(400).json({ error: 'Start time and end time cannot be the same' });
      }

      const normalizedWorkerIds = normalizeWorkerIds(worker_ids);
      if (normalizedWorkerIds.length < 1) {
        return res.status(400).json({ error: 'At least one worker is required' });
      }

      if (new Set(normalizedWorkerIds).size !== normalizedWorkerIds.length) {
        return res.status(400).json({ error: 'Duplicate workers are not allowed' });
      }

      if (Number(worker_count) !== normalizedWorkerIds.length) {
        return res.status(400).json({ error: 'Worker count must match selected workers' });
      }

      const day = getDayOfWeek(date);

      const employeeRows = db.exec(
        `SELECT e.id, e.full_name
         FROM employees e
         JOIN users u ON u.id = e.user_id
         WHERE e.id IN (${worker_ids.map(() => '?').join(',')}) AND u.is_active = 1`,
        normalizedWorkerIds
      );

      const validEmployees = employeeRows.length > 0 ? employeeRows[0].values : [];
      if (validEmployees.length !== normalizedWorkerIds.length) {
        return res.status(400).json({ error: 'One or more selected employees are invalid' });
      }

      const selectedNames = validEmployees.map((row) => row[1]);

      db.run(
        `INSERT INTO reports (project_name, client, date, day, location, start_time, end_time, workers, worker_count, status, worker_ids, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          project_name,
          client,
          date,
          day,
          location,
          start_time,
          end_time,
          JSON.stringify(selectedNames),
          normalizedWorkerIds.length,
          JSON.stringify(normalizedWorkerIds),
          req.authUser.id,
        ]
      );
      
      saveDatabase();

      // Get last inserted id (MAX(id) is reliable here for a single-process local DB).
      const idResult = db.exec('SELECT id FROM reports ORDER BY id DESC LIMIT 1');
      const reportId = idResult.length > 0 ? idResult[0].values[0][0] : null;

      res.status(201).json({
        message: 'Report created successfully',
        report: {
          id: reportId,
          project_name,
          client,
          date,
          day,
          location,
          start_time,
          end_time,
          workers: selectedNames,
          worker_ids: normalizedWorkerIds,
          worker_count: normalizedWorkerIds.length,
          status: 'pending',
        },
      });
    } catch (error) {
      console.error('Report creation error:', error);
      res.status(500).json({ error: 'Failed to create report' });
    }
  }
);

// GET /employees - Employees list for comboboxes
app.get('/employees', requireAuthenticatedUser, (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const result = db.exec(
      `SELECT e.id, e.serial_id, e.full_name, u.phone_number
       FROM employees e
       JOIN users u ON u.id = e.user_id
       WHERE u.is_active = 1
       ORDER BY e.full_name ASC`
    );

    const employees = result.length > 0
      ? result[0].values.map((row) => ({ id: row[0], serial_id: row[1], full_name: row[2], phone_number: row[3] || '' }))
      : [];

    res.json({ employees });
  } catch (error) {
    console.error('Employees list error:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// ==================== MANAGER ENDPOINTS (Protected) ====================

// POST /manager/employees - Manager creates employee (username/password = serial id)
app.post(
  '/manager/employees',
  requireManagerAccess,
  [
    body('serial_id').trim().matches(/^\d{5,10}$/),
    body('full_name').notEmpty().trim(),
    body('phone_number').optional({ checkFalsy: true }).trim().matches(/^\d{7,15}$/),
    body('job_title').optional({ checkFalsy: true }).trim(),
    body('project_bonus').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const serialId = req.body.serial_id.trim();
    const fullName = req.body.full_name.trim();
    const phoneNumber = (req.body.phone_number || '').toString().trim();
    const jobTitle = (req.body.job_title || '').toString().trim();
    const projectBonus = parseFloat(req.body.project_bonus) || 0;
    const role = req.body.role === 'manager' ? 'manager' : 'employee';

    try {
      const exists = db.exec('SELECT id FROM users WHERE serial_id = ? LIMIT 1', [serialId]);
      if (exists.length > 0 && exists[0].values.length > 0) {
        return res.status(409).json({ error: 'עובד עם תעודת זהות זו כבר קיים במערכת' });
      }

      db.run(
        'INSERT INTO users (serial_id, password, role, full_name, phone_number, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [serialId, serialId, role, fullName, phoneNumber || null]
      );

      const userRow = db.exec('SELECT id FROM users WHERE serial_id = ? LIMIT 1', [serialId]);
      const userId = userRow[0].values[0][0];

      try {
        db.run(
          'INSERT INTO employees (user_id, serial_id, full_name, job_title, project_bonus) VALUES (?, ?, ?, ?, ?)',
          [userId, serialId, fullName, jobTitle || null, projectBonus]
        );
      } catch (empError) {
        // Roll back user creation if employee row insert fails
        db.run('DELETE FROM users WHERE id = ?', [userId]);
        throw empError;
      }

      saveDatabase();

      res.status(201).json({
        message: 'Employee created successfully',
        employee: {
          user_id: userId,
          serial_id: serialId,
          full_name: fullName,
          phone_number: phoneNumber,
          job_title: jobTitle,
          project_bonus: projectBonus,
          username: serialId,
          password: serialId,
        },
      });
    } catch (error) {
      console.error('Create employee error:', error);
      res.status(500).json({ error: 'Failed to create employee' });
    }
  }
);

function parseWorkerIds(rawValue) {
  if (!rawValue && rawValue !== 0) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0);
      }
    } catch (parseError) {
      // Fall through to fallback string parsing
    }

    return trimmed
      .split(/[,\s]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  return [];
}

function statusToHebrew(status) {
  if (status === 'pending') return 'בהמתנה';
  if (status === 'approved') return 'מאושר';
  if (status === 'rejected') return 'דחוי';
  return status;
}

function buildEmployeeReportDetails(employeeId, options = {}) {
  const { startDate = null, endDate = null, projectBonus = 0 } = options;

  const reportsResult = db.exec(
    `SELECT r.id, r.project_name, r.client, r.date, r.day, r.location, r.start_time, r.end_time,
            r.worker_count, r.status, r.worker_ids,
            c.hourly_rate, c.distance_km, c.food_cost, c.travel_cost, c.final_cost, c.final_cost_vat
     FROM reports r
     LEFT JOIN costs c ON c.report_id = r.id
     ORDER BY r.date DESC, r.created_at DESC`
  );

  const allReports = reportsResult.length > 0
    ? reportsResult[0].values.map((row) => ({
        id: row[0],
        project_name: row[1],
        client: row[2],
        date: row[3],
        day: row[4],
        location: row[5],
        start_time: row[6],
        end_time: row[7],
        worker_count: Number(row[8]) || 0,
        status: row[9],
        worker_ids: row[10],
        daily_rate: Number(row[11]) || 0,
        distance_km: Number(row[12]) || 0,
        food_cost: Number(row[13]) || 0,
        travel_cost: Number(row[14]) || 0,
        final_cost: Number(row[15]) || 0,
        final_cost_vat: Number(row[16]) || 0,
      }))
    : [];

  const employeeReports = allReports
    .filter((report) => parseWorkerIds(report.worker_ids).includes(Number(employeeId)))
    .filter((report) => {
      if (startDate && report.date < startDate) {
        return false;
      }
      if (endDate && report.date > endDate) {
        return false;
      }
      return true;
    })
    .map((report) => {
      const workerCount = report.worker_count > 0 ? report.worker_count : 1;
      const workHours = calculateWorkHours(report.start_time, report.end_time);
      const distanceCost = report.distance_km * 1.5;
      const totalFoodCost = report.food_cost * workerCount;
      const expenseShare = (distanceCost + totalFoodCost + report.travel_cost) / workerCount;
      const totalShareWithVat = report.final_cost_vat > 0 ? report.final_cost_vat / workerCount : 0;
      const payDue = report.status === 'approved'
        ? Number((report.daily_rate + expenseShare).toFixed(2))
        : 0;

      return {
        id: report.id,
        project_name: report.project_name,
        client: report.client,
        date: report.date,
        day: report.day,
        location: report.location,
        start_time: report.start_time,
        end_time: report.end_time,
        worker_count: report.worker_count,
        status: report.status,
        work_hours: Number(workHours.toFixed(2)),
        daily_rate: Number(report.daily_rate.toFixed(2)),
        distance_km: Number(report.distance_km.toFixed(2)),
        food_cost: Number(report.food_cost.toFixed(2)),
        travel_cost: Number(report.travel_cost.toFixed(2)),
        final_cost: Number(report.final_cost.toFixed(2)),
        final_cost_vat: Number(report.final_cost_vat.toFixed(2)),
        expense_share: Number(expenseShare.toFixed(2)),
        total_share_with_vat: Number(totalShareWithVat.toFixed(2)),
        project_bonus: report.status === 'approved' ? Number(projectBonus.toFixed(2)) : 0,
        pay_due: payDue,
      };
    });

  const summary = employeeReports.reduce(
    (acc, report) => ({
      total_reports: acc.total_reports + 1,
      approved_reports: acc.approved_reports + (report.status === 'approved' ? 1 : 0),
      total_hours: acc.total_hours + report.work_hours,
      total_pay_due: acc.total_pay_due + report.pay_due,
      total_share_with_vat: acc.total_share_with_vat + report.total_share_with_vat,
      projects: new Set([...acc.projects, report.project_name]),
    }),
    {
      total_reports: 0,
      approved_reports: 0,
      total_hours: 0,
      total_pay_due: 0,
      total_share_with_vat: 0,
      projects: new Set(),
    }
  );

  const approvedCount = summary.approved_reports;
  const totalBasePay = Number(summary.total_pay_due.toFixed(2));
  const totalProjectBonus = Number((projectBonus * approvedCount).toFixed(2));

  return {
    reports: employeeReports,
    summary: {
      total_reports: summary.total_reports,
      approved_reports: approvedCount,
      total_hours: Number(summary.total_hours.toFixed(2)),
      total_base_pay: totalBasePay,
      total_project_bonus: totalProjectBonus,
      total_pay_due: Number((totalBasePay + totalProjectBonus).toFixed(2)),
      total_share_with_vat: Number(summary.total_share_with_vat.toFixed(2)),
      total_projects: summary.projects.size,
      projects: Array.from(summary.projects),
      project_bonus: projectBonus,
    },
  };
}

// GET /manager/employees - Manager employee page data + summary
app.get('/manager/employees', requireManagerAccess, (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const search = (req.query.search || '').toString().trim().toLowerCase();
    const rows = db.exec(
      `SELECT e.id, e.serial_id, e.full_name, e.user_id, u.phone_number, e.job_title, e.project_bonus, u.role
       FROM employees e
       JOIN users u ON u.id = e.user_id
       WHERE u.is_active = 1
       ORDER BY e.full_name ASC`
    );

    const employees = (rows.length > 0 ? rows[0].values : [])
      .map((row) => ({
        id: row[0],
        serial_id: row[1],
        full_name: row[2],
        user_id: row[3],
        phone_number: row[4] || '',
        job_title: row[5] || '',
        project_bonus: Number(row[6]) || 0,
        role: row[7] || 'employee',
      }))
      .filter((employee) => (search ? employee.full_name.toLowerCase().includes(search) : true));

    const allReportsResult = db.exec(
      `SELECT id, project_name, date, start_time, end_time, status, worker_ids
       FROM reports
       ORDER BY date DESC, created_at DESC`
    );

    const allReports = allReportsResult.length > 0
      ? allReportsResult[0].values.map((row) => ({
          id: row[0],
          project_name: row[1],
          date: row[2],
          start_time: row[3],
          end_time: row[4],
          status: row[5],
          worker_ids: row[6],
        }))
      : [];

    const employeeSummaries = employees.map((employee) => {
      const reports = allReports.filter((report) => {
        if (!report.worker_ids) {
          return false;
        }

        try {
          const ids = JSON.parse(report.worker_ids);
          return Array.isArray(ids) && ids.map((id) => Number(id)).includes(Number(employee.id));
        } catch (error) {
          return false;
        }
      });

      const totalHours = reports.reduce((sum, report) => sum + calculateWorkHours(report.start_time, report.end_time), 0);
      const projectCount = new Set(reports.map((report) => report.project_name)).size;

      return {
        ...employee,
        total_reports: reports.length,
        total_hours: parseFloat(totalHours.toFixed(2)),
        total_projects: projectCount,
        projects: Array.from(new Set(reports.map((report) => report.project_name))),
      };
    });

    res.json({ employees: employeeSummaries });
  } catch (error) {
    console.error('Manager employees error:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

// GET /manager/employees/:id/summary - Detailed summary and cost data for one employee
app.get('/manager/employees/:id/summary', requireManagerAccess, (req, res) => {
  try {
        const dateRange = normalizeDateRange(req.query.start_date, req.query.end_date);
        if (dateRange.error) {
          return res.status(400).json({ error: dateRange.error });
        }

    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const employeeId = parseInt(req.params.id, 10);
    if (Number.isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee id' });
    }

    const employeeResult = db.exec(
      `SELECT e.id, e.serial_id, e.full_name, e.user_id, u.phone_number, e.job_title, e.project_bonus
       FROM employees e
       JOIN users u ON u.id = e.user_id
       WHERE e.id = ? AND u.is_active = 1
       LIMIT 1`,
      [employeeId]
    );

    if (employeeResult.length === 0 || employeeResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const row = employeeResult[0].values[0];
    const details = buildEmployeeReportDetails(employeeId, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      projectBonus: Number(row[6]) || 0,
    });

    return res.json({
      employee: {
        id: row[0],
        serial_id: row[1],
        full_name: row[2],
        user_id: row[3],
        phone_number: row[4] || '',
        job_title: row[5] || '',
        project_bonus: Number(row[6]) || 0,
      },
      summary: details.summary,
      reports: details.reports,
      filters: {
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      },
    });
  } catch (error) {
    console.error('Employee summary error:', error);
    return res.status(500).json({ error: 'Failed to fetch employee summary' });
  }
});

// PUT /manager/employees/:id - Manager updates employee user details
app.put(
  '/manager/employees/:id',
  requireManagerAccess,
  [
    body('serial_id').trim().matches(/^\d{5,10}$/),
    body('full_name').notEmpty().trim(),
    body('phone_number').optional({ checkFalsy: true }).trim().matches(/^\d{7,15}$/),
    body('job_title').optional({ checkFalsy: true }).trim(),
    body('project_bonus').optional({ checkFalsy: true }).isFloat({ min: 0 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!db) return res.status(503).json({ error: 'Database not initialized' });

      const employeeId = parseInt(req.params.id, 10);
      if (Number.isNaN(employeeId)) {
        return res.status(400).json({ error: 'Invalid employee id' });
      }

      const serialId = req.body.serial_id.trim();
      const fullName = req.body.full_name.trim();
      const phoneNumber = (req.body.phone_number || '').toString().trim();
      const jobTitle = (req.body.job_title || '').toString().trim();
      const projectBonus = req.body.project_bonus !== undefined && req.body.project_bonus !== '' ? parseFloat(req.body.project_bonus) : null;
      const role = req.body.role && ['employee', 'manager'].includes(req.body.role) ? req.body.role : null;

      const employeeRow = db.exec('SELECT user_id FROM employees WHERE id = ? LIMIT 1', [employeeId]);
      if (employeeRow.length === 0 || employeeRow[0].values.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const userId = employeeRow[0].values[0][0];

      const duplicateSerial = db.exec(
        'SELECT id FROM users WHERE serial_id = ? AND id <> ? LIMIT 1',
        [serialId, userId]
      );
      if (duplicateSerial.length > 0 && duplicateSerial[0].values.length > 0) {
        return res.status(409).json({ error: 'Another user already uses this serial id' });
      }

      const userUpdateParts = ['serial_id = ?', 'password = ?', 'full_name = ?', 'phone_number = ?'];
      const userUpdateParams = [serialId, serialId, fullName, phoneNumber || null];
      if (role !== null) {
        userUpdateParts.push('role = ?');
        userUpdateParams.push(role);
      }
      userUpdateParams.push(userId);

      db.run(
        `UPDATE users SET ${userUpdateParts.join(', ')} WHERE id = ?`,
        userUpdateParams
      );
      db.run(
        'UPDATE employees SET serial_id = ?, full_name = ?, job_title = ?, project_bonus = COALESCE(?, project_bonus) WHERE id = ?',
        [serialId, fullName, jobTitle || null, projectBonus, employeeId]
      );

      saveDatabase();

      return res.json({
        message: 'Employee updated successfully',
        employee: {
          id: employeeId,
          user_id: userId,
          serial_id: serialId,
          full_name: fullName,
          phone_number: phoneNumber,
          job_title: jobTitle,
          project_bonus: projectBonus !== null ? projectBonus : undefined,
          role: role !== null ? role : undefined,
        },
      });
    } catch (error) {
      console.error('Update employee error:', error);
      return res.status(500).json({ error: 'Failed to update employee' });
    }
  }
);

// GET /manager/employees/:id/export - Export one employee report summary to Excel
app.get('/manager/employees/:id/export', requireManagerAccess, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const employeeId = parseInt(req.params.id, 10);
    if (Number.isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee id' });
    }

    const dateRange = normalizeDateRange(req.query.start_date, req.query.end_date);
    if (dateRange.error) {
      return res.status(400).json({ error: dateRange.error });
    }

    const employeeResult = db.exec(
      `SELECT e.id, e.serial_id, e.full_name, u.phone_number, e.job_title, e.project_bonus
       FROM employees e
       JOIN users u ON u.id = e.user_id
       WHERE e.id = ? AND u.is_active = 1
       LIMIT 1`,
      [employeeId]
    );

    if (employeeResult.length === 0 || employeeResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeRow = employeeResult[0].values[0];
    const employeeProjectBonus = Number(employeeRow[5]) || 0;
    const details = buildEmployeeReportDetails(employeeId, {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      projectBonus: employeeProjectBonus,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('סיכום עובד');

    worksheet.views = [{ rightToLeft: true }];

    worksheet.columns = [
      { header: 'מספר דוח', key: 'id', width: 10 },
      { header: 'תאריך', key: 'date', width: 13 },
      { header: 'יום', key: 'day', width: 8 },
      { header: 'סטטוס', key: 'status', width: 10 },
      { header: 'פרויקט', key: 'project_name', width: 22 },
      { header: 'לקוח', key: 'client', width: 22 },
      { header: 'מיקום', key: 'location', width: 18 },
      { header: 'שעת התחלה', key: 'start_time', width: 12 },
      { header: 'שעת סיום', key: 'end_time', width: 12 },
      { header: 'שעות עבודה', key: 'work_hours', width: 12 },
      { header: 'תעריף יומי', key: 'daily_rate', width: 12 },
      { header: 'מרחק קמ', key: 'distance_km', width: 10 },
      { header: 'עלות אוכל (לעובד)', key: 'food_cost', width: 16 },
      { header: 'עלות נסיעות', key: 'travel_cost', width: 12 },
      { header: 'תוספת תפקיד', key: 'project_bonus', width: 14 },
      { header: 'חלק יחסי כולל מעמ', key: 'total_share_with_vat', width: 18 },
      { header: 'תשלום לעובד', key: 'pay_due', width: 14 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.alignment = { horizontal: 'center' };

    details.reports.forEach((report, idx) => {
      const foodCostDisplay = report.worker_count > 0 && report.food_cost > 0 
        ? `${report.worker_count} עובדים × ₪${report.food_cost.toFixed(2)}`
        : report.food_cost > 0 ? `₪${report.food_cost.toFixed(2)}` : '';
      
      const dataRow = worksheet.addRow({
        ...report,
        status: statusToHebrew(report.status),
        food_cost: foodCostDisplay,
      });
      // Alternate row background
      if (idx % 2 === 0) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F8FF' } };
      }
      // Currency format for money columns
      ['daily_rate', 'project_bonus', 'total_share_with_vat', 'pay_due'].forEach((key) => {
        const cell = dataRow.getCell(key);
        if (cell.value !== null && cell.value !== 0) cell.numFmt = '"₪"#,##0.00';
      });
    });

    // Totals row — includes all costs: base pay + project bonus
    worksheet.addRow([]);
    const totalCostWithBonus = details.summary.total_base_pay + (employeeProjectBonus > 0 ? details.summary.total_project_bonus : 0);
    const totalsRow = worksheet.addRow({
      project_name: 'סה"כ לתשלום',
      project_bonus: employeeProjectBonus > 0 ? details.summary.total_project_bonus : undefined,
      pay_due: totalCostWithBonus,
    });
    totalsRow.font = { bold: true };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
    totalsRow.getCell('pay_due').numFmt = '"₪"#,##0.00';
    if (employeeProjectBonus > 0) totalsRow.getCell('project_bonus').numFmt = '"₪"#,##0.00';

    // Summary block — uses columns A and B (index 1 and 2)
    const addSummaryRow = (label, value, bold = false) => {
      const row = worksheet.addRow([label, value]);
      if (bold) row.font = { bold: true };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
    };

    worksheet.addRow([]);
    addSummaryRow('עובד', employeeRow[2], true);
    addSummaryRow('תעודת זהות', employeeRow[1]);
    addSummaryRow('טלפון', employeeRow[3] || '');
    if (employeeRow[4]) addSummaryRow('תפקיד', employeeRow[4]);
    if (Number(employeeRow[5]) > 0) addSummaryRow('תוספת תפקיד (₪)', Number(employeeRow[5]));
    addSummaryRow('מתאריך', dateRange.startDate || '');
    addSummaryRow('עד תאריך', dateRange.endDate || '');
    worksheet.addRow([]);
    addSummaryRow('סה"כ דוחות', details.summary.total_reports);
    addSummaryRow('דוחות מאושרים', details.summary.approved_reports);
    addSummaryRow('סה"כ שעות', details.summary.total_hours);
    addSummaryRow('סה"כ פרויקטים', details.summary.total_projects);
    if (employeeProjectBonus > 0) {
      addSummaryRow('תשלום בסיסי', details.summary.total_base_pay);
      addSummaryRow(`תוספת תפקיד (${details.summary.approved_reports} דוחות × ₪${employeeProjectBonus})`, details.summary.total_project_bonus, true);
      addSummaryRow('סה"כ לתשלום (כולל תוספת תפקיד)', details.summary.total_pay_due, true);
    } else {
      addSummaryRow('סה"כ לתשלום', details.summary.total_pay_due, true);
    }

    const fileName = `employee_summary_${employeeRow[1]}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error('Employee export error:', error);
    return res.status(500).json({ error: 'Failed to export employee data' });
  }
});

// DELETE /manager/employees/:id - Deactivate employee and remove user
app.delete('/manager/employees/:id', requireManagerAccess, (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const employeeId = parseInt(req.params.id, 10);
    if (Number.isNaN(employeeId)) {
      return res.status(400).json({ error: 'Invalid employee id' });
    }

    const employeeRow = db.exec('SELECT user_id FROM employees WHERE id = ? LIMIT 1', [employeeId]);
    if (employeeRow.length === 0 || employeeRow[0].values.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const userId = employeeRow[0].values[0][0];

    db.run('DELETE FROM employees WHERE id = ?', [employeeId]);
    db.run('DELETE FROM users WHERE id = ?', [userId]);
    saveDatabase();

    return res.json({ message: 'Employee and user deleted successfully' });
  } catch (error) {
    console.error('Delete employee error:', error);
    return res.status(500).json({ error: 'Failed to delete employee' });
  }
});

// GET /manager/reports - Get pending reports
app.get('/manager/reports', requireManagerAccess, (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const allowedStatuses = ['pending', 'approved', 'rejected', 'all'];
    const status = allowedStatuses.includes(req.query.status) ? req.query.status : 'pending';

    let result;
    if (status === 'all') {
      result = db.exec(
        `SELECT r.*, c.final_cost_vat FROM reports r
         LEFT JOIN costs c ON r.id = c.report_id
         ORDER BY r.date DESC, r.created_at DESC`
      );
    } else {
      result = db.exec(
        `SELECT r.*, c.final_cost_vat FROM reports r
         LEFT JOIN costs c ON r.id = c.report_id
         WHERE r.status = ?
         ORDER BY r.date DESC, r.created_at DESC`,
        [status]
      );
    }

    const reports = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      project_name: row[1],
      client: row[2],
      date: row[3],
      day: row[4],
      location: row[5],
      start_time: row[6],
      end_time: row[7],
      workers: row[8],
      worker_count: row[9],
      status: row[10],
      created_at: row[11],
      updated_at: row[12],
      worker_ids: row[13],
      created_by_user_id: row[14],
      final_cost_vat: row[15]
    })) : [];

    res.json(reports);
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /manager/reports/:id - Get report details
app.get('/manager/reports/:id', requireManagerAccess, (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const reportId = parseInt(req.params.id, 10);
    if (Number.isNaN(reportId)) {
      return res.status(400).json({ error: 'Invalid report id' });
    }

    const reportResult = db.exec('SELECT * FROM reports WHERE id = ?', [reportId]);
    const costResult = db.exec('SELECT * FROM costs WHERE report_id = ?', [reportId]);

    if (reportResult.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = reportResult[0].values[0];
    const cost = costResult.length > 0 ? costResult[0].values[0] : null;
    const reportProjectBonus = calculateProjectBonusForWorkers(parseWorkerIds(report[13]));

    const workHours = calculateWorkHours(report[6], report[7]);

    res.json({
      id: report[0],
      project_name: report[1],
      client: report[2],
      date: report[3],
      day: report[4],
      location: report[5],
      start_time: report[6],
      end_time: report[7],
      workers: report[8],
      worker_count: report[9],
      status: report[10],
      created_at: report[11],
      updated_at: report[12],
      worker_ids: parseWorkerIds(report[13]),
      created_by_user_id: report[14],
      work_hours: workHours,
      cost: cost ? {
        id: cost[0],
        report_id: cost[1],
        hourly_rate: cost[2],
        distance_km: cost[3],
        food_cost: cost[4],
        travel_cost: cost[5],
        final_cost: cost[6],
        final_cost_vat: cost[7],
        project_bonus: reportProjectBonus,
      } : {}
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// PUT /manager/reports/:id - Update report and add costs
app.put(
  '/manager/reports/:id',
  requireManagerAccess,
  [
    body('project_name').optional().trim().notEmpty(),
    body('client').optional().trim().notEmpty(),
    body('date').optional().isISO8601(),
    body('location').optional().trim().notEmpty(),
    body('start_time').optional().matches(/^\d{2}:\d{2}$/),
    body('end_time').optional().matches(/^\d{2}:\d{2}$/),
    body('worker_ids').optional().isArray({ min: 1 }),
    body('daily_rate').optional().isFloat({ min: 0 }),
    body('distance_km').optional().isFloat({ min: 0 }),
    body('food_cost').optional().isFloat({ min: 0 }),
    body('travel_cost').optional().isFloat({ min: 0 }),
    body('status').optional().isIn(['pending', 'approved', 'rejected']),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const { id } = req.params;
    const {
      project_name,
      client,
      date,
      location,
      start_time,
      end_time,
      worker_ids,
      daily_rate,
      distance_km,
      food_cost,
      travel_cost,
      status,
    } = req.body;

    try {
      // Get existing report
      const reportResult = db.exec('SELECT * FROM reports WHERE id = ?', [parseInt(id)]);
      if (reportResult.length === 0) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const report = reportResult[0].values[0];

      const nextProjectName = project_name !== undefined ? String(project_name).trim() : report[1];
      const nextClient = client !== undefined ? String(client).trim() : report[2];
      const nextDate = date !== undefined ? String(date).trim() : report[3];
      const nextLocation = location !== undefined ? String(location).trim() : report[5];
      const nextStartTime = start_time !== undefined ? String(start_time).trim() : report[6];
      const nextEndTime = end_time !== undefined ? String(end_time).trim() : report[7];

      const existingWorkerIds = parseWorkerIds(report[13]);
      const requestedWorkerIds = worker_ids !== undefined ? normalizeWorkerIds(worker_ids) : existingWorkerIds;

      if (!nextProjectName || !nextClient || !nextLocation) {
        return res.status(400).json({ error: 'Project name, client and location are required' });
      }

      if (!isValidIsoDate(nextDate)) {
        return res.status(400).json({ error: 'Invalid date format' });
      }

      if (!isValidTimeValue(nextStartTime) || !isValidTimeValue(nextEndTime)) {
        return res.status(400).json({ error: 'Invalid time format' });
      }

      if (nextStartTime === nextEndTime) {
        return res.status(400).json({ error: 'Start time and end time cannot be the same' });
      }

      if (requestedWorkerIds.length < 1) {
        return res.status(400).json({ error: 'At least one worker is required' });
      }

      if (new Set(requestedWorkerIds).size !== requestedWorkerIds.length) {
        return res.status(400).json({ error: 'Duplicate workers are not allowed' });
      }

      // Only validate worker existence when worker_ids were explicitly changed in this request.
      // Skipping when not changed prevents failures if an employee was deleted after assignment.
      let selectedNames;
      if (worker_ids !== undefined) {
        const employeeRows = db.exec(
          `SELECT e.id, e.full_name
           FROM employees e
           JOIN users u ON u.id = e.user_id
           WHERE e.id IN (${requestedWorkerIds.map(() => '?').join(',')}) AND u.is_active = 1`,
          requestedWorkerIds
        );
        const validEmployees = employeeRows.length > 0 ? employeeRows[0].values : [];
        if (validEmployees.length !== requestedWorkerIds.length) {
          return res.status(400).json({ error: 'One or more selected employees are invalid' });
        }
        selectedNames = validEmployees.map((row) => row[1]);
      } else {
        try { selectedNames = JSON.parse(report[8]) || []; } catch { selectedNames = []; }
      }

      const costCheckResult = db.exec('SELECT id, report_id, hourly_rate, distance_km, food_cost, travel_cost FROM costs WHERE report_id = ?', [parseInt(id)]);
      const existingCost = costCheckResult.length > 0 ? costCheckResult[0].values[0] : null;
      const mergedCostValues = {
        daily_rate: daily_rate !== undefined ? Number(daily_rate) : (existingCost ? existingCost[2] : null),
        distance_km: distance_km !== undefined ? Number(distance_km) : (existingCost ? existingCost[3] : null),
        food_cost: food_cost !== undefined ? Number(food_cost) : (existingCost ? existingCost[4] : null),
        travel_cost: travel_cost !== undefined ? Number(travel_cost) : (existingCost ? existingCost[5] : null),
      };

      const targetStatus = status || report[10];

      if (targetStatus === 'approved' && !hasAllCostValues(mergedCostValues)) {
        return res.status(400).json({ error: 'Cannot approve report without full cost data' });
      }

      const nextDay = getDayOfWeek(nextDate);

      db.run(
        `UPDATE reports
         SET project_name = ?, client = ?, date = ?, day = ?, location = ?,
             start_time = ?, end_time = ?, workers = ?, worker_count = ?, worker_ids = ?,
             updated_at = datetime("now")
         WHERE id = ?`,
        [
          nextProjectName,
          nextClient,
          nextDate,
          nextDay,
          nextLocation,
          nextStartTime,
          nextEndTime,
          JSON.stringify(selectedNames),
          requestedWorkerIds.length,
          JSON.stringify(requestedWorkerIds),
          parseInt(id),
        ]
      );

      // Update status only after all validations passed.
      if (status) {
        db.run('UPDATE reports SET status = ?, updated_at = datetime("now") WHERE id = ?', [status, parseInt(id)]);
      }

      // Calculate and save costs
      if (
        daily_rate !== undefined ||
        distance_km !== undefined ||
        food_cost !== undefined ||
        travel_cost !== undefined ||
        targetStatus === 'approved'
      ) {
        const projectBonus = calculateProjectBonusForWorkers(requestedWorkerIds);
        const costs = calculateCosts(
          requestedWorkerIds.length,
          mergedCostValues.daily_rate,
          mergedCostValues.distance_km,
          mergedCostValues.food_cost,
          mergedCostValues.travel_cost,
          projectBonus
        );

        if (costCheckResult.length > 0) {
          db.run(
            `UPDATE costs SET hourly_rate = ?, distance_km = ?, food_cost = ?, travel_cost = ?, 
             final_cost = ?, final_cost_vat = ?, updated_at = datetime("now")
             WHERE report_id = ?`,
            [
              mergedCostValues.daily_rate,
              mergedCostValues.distance_km,
              mergedCostValues.food_cost,
              mergedCostValues.travel_cost,
              costs.final_cost,
              costs.final_cost_vat,
              parseInt(id)
            ]
          );
        } else {
          db.run(
            `INSERT INTO costs (report_id, hourly_rate, distance_km, food_cost, travel_cost, final_cost, final_cost_vat, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"), datetime("now"))`,
            [
              parseInt(id),
              mergedCostValues.daily_rate,
              mergedCostValues.distance_km,
              mergedCostValues.food_cost,
              mergedCostValues.travel_cost,
              costs.final_cost,
              costs.final_cost_vat
            ]
          );
        }
      }

      saveDatabase();

      const finalReportResult = db.exec('SELECT * FROM reports WHERE id = ?', [parseInt(id)]);
      const finalCostResult = db.exec('SELECT * FROM costs WHERE report_id = ?', [parseInt(id)]);

      res.json({
        message: 'Report updated successfully',
        report: finalReportResult.length > 0 ? finalReportResult[0].values[0] : {},
        cost: finalCostResult.length > 0 ? finalCostResult[0].values[0] : {},
      });
    } catch (error) {
      console.error('Update report error:', error);
      res.status(500).json({ error: 'Failed to update report' });
    }
  }
);

// GET /manager/reports-by-date - Get reports by date
app.get('/manager/reports-by-date', requireManagerAccess, [query('date').isISO8601()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const { date } = req.query;

    const result = db.exec(
      `SELECT r.*, c.final_cost_vat, c.hourly_rate, c.distance_km, c.food_cost, c.travel_cost
       FROM reports r
       LEFT JOIN costs c ON r.id = c.report_id
       WHERE r.date = ?
       ORDER BY r.created_at DESC`,
      [date]
    );

    const reports = result.length > 0 ? result[0].values.map(row => {
      const workerIds = parseWorkerIds(row[13]);
      const workerCount = workerIds.length || Number(row[9]) || 0;
      const projectBonus = calculateProjectBonusForWorkers(workerIds);
      const finalCost = calculateCosts(
        workerCount,
        Number(row[16]) || 0,
        Number(row[17]) || 0,
        Number(row[18]) || 0,
        Number(row[19]) || 0,
        projectBonus
      );

      return {
        id: row[0],
        project_name: row[1],
        client: row[2],
        date: row[3],
        day: row[4],
        location: row[5],
        start_time: row[6],
        end_time: row[7],
        workers: row[8],
        worker_count: row[9],
        status: row[10],
        created_at: row[11],
        updated_at: row[12],
        worker_ids: row[13],
        created_by_user_id: row[14],
        project_bonus: projectBonus,
        final_cost_vat: finalCost.final_cost_vat,
      };
    }) : [];

    const totalHours = reports.reduce((sum, report) => {
      const hours = calculateWorkHours(report.start_time, report.end_time);
      return sum + hours;
    }, 0);

    const totalWorkers = reports.reduce((sum, report) => sum + report.worker_count, 0);
    const totalCost = reports.reduce((sum, report) => sum + (parseFloat(report.final_cost_vat) || 0), 0);

    res.json({
      date,
      reports,
      summary: {
        total_reports: reports.length,
        total_workers: totalWorkers,
        total_hours: parseFloat(totalHours.toFixed(2)),
        total_cost: parseFloat(totalCost.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('Get by date error:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /manager/calendar-summary - Report count per day for a month
app.get('/manager/calendar-summary', requireManagerAccess, [query('month').matches(/^\d{4}-\d{2}$/)], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const { month } = req.query;

    const result = db.exec(
      `SELECT date, COUNT(*) as report_count
       FROM reports
       WHERE strftime('%Y-%m', date) = ?
       GROUP BY date
       ORDER BY date ASC`,
      [month]
    );

    const summary = result.length > 0
      ? result[0].values.map((row) => ({ date: row[0], report_count: row[1] }))
      : [];

    res.json({ month, summary });
  } catch (error) {
    console.error('Calendar summary error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar summary' });
  }
});

// GET /manager/projects - Distinct projects for selected month
app.get('/manager/projects', requireManagerAccess, [query('month').matches(/^\d{4}-\d{2}$/)], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const { month } = req.query;
    const [year, monthNum] = month.split('-');

    const result = db.exec(
      `SELECT DISTINCT project_name
       FROM reports
       WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?
       ORDER BY project_name ASC`,
      [year, monthNum]
    );

    const projects = result.length > 0 ? result[0].values.map((row) => row[0]) : [];

    res.json({ month, projects });
  } catch (error) {
    console.error('Projects error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /manager/project-reports - All reports by project for selected month
app.get(
  '/manager/project-reports',
  requireManagerAccess,
  [query('project').notEmpty(), query('month').matches(/^\d{4}-\d{2}$/)],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (!db) return res.status(503).json({ error: 'Database not initialized' });

      const { project, month } = req.query;
      const [year, monthNum] = month.split('-');

      const result = db.exec(
        `SELECT r.*, c.final_cost_vat
         FROM reports r
         LEFT JOIN costs c ON r.id = c.report_id
         WHERE r.project_name = ? AND strftime('%Y', r.date) = ? AND strftime('%m', r.date) = ?
         ORDER BY r.date ASC, r.created_at ASC`,
        [project, year, monthNum.padStart(2, '0')]
      );

      const reports = result.length > 0
        ? result[0].values.map((row) => ({
            id: row[0],
            project_name: row[1],
            client: row[2],
            date: row[3],
            day: row[4],
            location: row[5],
            start_time: row[6],
            end_time: row[7],
            workers: row[8],
            worker_count: row[9],
            status: row[10],
            created_at: row[11],
            updated_at: row[12],
            worker_ids: row[13],
            created_by_user_id: row[14],
            final_cost_vat: row[15],
          }))
        : [];

      const summary = reports.reduce(
        (acc, report) => {
          const hours = calculateWorkHours(report.start_time, report.end_time);
          return {
            total_reports: acc.total_reports + 1,
            total_workers: acc.total_workers + (report.worker_count || 0),
            total_hours: acc.total_hours + hours,
          };
        },
        { total_reports: 0, total_workers: 0, total_hours: 0 }
      );

      res.json({
        project,
        month,
        reports,
        summary: {
          total_reports: summary.total_reports,
          total_workers: summary.total_workers,
          total_hours: parseFloat(summary.total_hours.toFixed(2)),
        },
      });
    } catch (error) {
      console.error('Project reports error:', error);
      res.status(500).json({ error: 'Failed to fetch project reports' });
    }
  }
);

// GET /manager/export - Export to Excel
app.get('/manager/export', requireManagerAccess, [query('project').notEmpty(), query('month').matches(/^\d{4}-\d{2}$/)], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    if (!db) return res.status(503).json({ error: 'Database not initialized' });

    const { project, month } = req.query;
    const excludeIdsRaw = (req.query.exclude_ids || '').trim();
    const excludeIds = excludeIdsRaw
      ? excludeIdsRaw.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const clientNote = (req.query.client_note || '').trim().slice(0, 1000);
    const [year, monthNum] = month.split('-');

    const result = db.exec(
      `SELECT r.*, c.hourly_rate, c.distance_km, c.food_cost, c.travel_cost, c.final_cost, c.final_cost_vat
       FROM reports r
       LEFT JOIN costs c ON r.id = c.report_id
       WHERE r.project_name = ? AND strftime('%Y', r.date) = ? AND strftime('%m', r.date) = ?
       ORDER BY r.date ASC`,
      [project, year, monthNum.padStart(2, '0')]
    );

    const reports = result.length > 0 ? result[0].values.map(row => ({
      id: row[0],
      project_name: row[1],
      client: row[2],
      date: row[3],
      day: row[4],
      location: row[5],
      start_time: row[6],
      end_time: row[7],
      workers: row[8],
      worker_count: row[9],
      status: row[10],
      created_at: row[11],
      updated_at: row[12],
      worker_ids: row[13],
      created_by_user_id: row[14],
      hourly_rate: row[15],
      distance_km: row[16],
      food_cost: row[17],
      travel_cost: row[18],
      final_cost: row[19],
      final_cost_vat: row[20]
    })) : [];

    const filteredReports = excludeIds.length > 0
      ? reports.filter((r) => !excludeIds.includes(r.id))
      : reports;

    // Load employee data for per-report bonus calculation and name display
    const employeeBonusResult = db.exec(
      `SELECT id, full_name, job_title, project_bonus FROM employees`
    );
    const employeeBonusMap = {};
    if (employeeBonusResult.length > 0) {
      employeeBonusResult[0].values.forEach((row) => {
        employeeBonusMap[Number(row[0])] = {
          full_name: row[1] || '',
          job_title: row[2] || '',
          project_bonus: Number(row[3]) || 0,
        };
      });
    }

    const getReportBonus = (workerIdsRaw) => {
      const ids = parseWorkerIds(workerIdsRaw);
      return ids.reduce((sum, id) => sum + (employeeBonusMap[id]?.project_bonus || 0), 0);
    };

    // Returns formatted worker list: "ראש צוות - פאנטי (₪100)\nשם עובד"
    const getWorkersDisplay = (workerIdsRaw) => {
      const ids = parseWorkerIds(workerIdsRaw);
      return ids.map((id) => {
        const emp = employeeBonusMap[id];
        if (!emp) return '';
        const title = emp.job_title ? `${emp.job_title} - ` : '';
        const bonus = emp.project_bonus > 0 ? ` (₪${emp.project_bonus})` : '';
        return `${title}${emp.full_name}${bonus}`;
      }).filter(Boolean).join('\n');
    };

    const workbook = new ExcelJS.Workbook();

    if (clientNote) {
      const noteSheet = workbook.addWorksheet('מכתב ללקוח');
      noteSheet.views = [{ rightToLeft: true }];
      noteSheet.getColumn(1).width = 80;
      noteSheet.addRow(['']);
      const titleRow = noteSheet.addRow([`פרויקט: ${project}  |  חודש: ${month}`]);
      titleRow.font = { bold: true, size: 13 };
      noteSheet.addRow(['']);
      const labelRow = noteSheet.addRow(['הערות ללקוח:']);
      labelRow.font = { bold: true };
      clientNote.split('\n').forEach((line) => noteSheet.addRow([line || '']));
      noteSheet.addRow(['']);
      noteSheet.addRow([`סה"כ דוחות בקובץ: ${filteredReports.length}`]);
    }

    const worksheet = workbook.addWorksheet('דוחות');

    // Force sheet to display right-to-left for Hebrew users.
    worksheet.views = [{ rightToLeft: true }];

    worksheet.columns = [
      { header: 'תאריך', key: 'date', width: 12 },
      { header: 'יום', key: 'day', width: 10 },
      { header: 'לקוח', key: 'client', width: 20 },
      { header: 'סטטוס', key: 'status', width: 10 },
      { header: 'מס\' עובדים', key: 'worker_count', width: 10 },
      { header: 'פירוט עובדים', key: 'workers_display', width: 30 },
      { header: 'שעות עבודה', key: 'work_hours', width: 12 },
      { header: 'מיקום', key: 'location', width: 22 },
      { header: 'תעריף יומי', key: 'hourly_rate', width: 14 },
      { header: 'עלות עבודה', key: 'labor_cost', width: 14 },
      { header: 'תוספת תפקיד', key: 'project_bonus', width: 16 },
      { header: 'מרחק (ק"מ)', key: 'distance_km', width: 12 },
      { header: 'עלות אוכל (לעובד)', key: 'food_cost', width: 18 },
      { header: 'עלות נסיעה', key: 'travel_cost', width: 12 },
      { header: 'עלות סופית', key: 'final_cost', width: 14 },
      { header: 'עלות סופית כולל מע"מ', key: 'final_cost_vat', width: 20 },
    ];

    // Style header row
    const hdrRow = worksheet.getRow(1);
    hdrRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hdrRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    hdrRow.alignment = { horizontal: 'center' };

    let totalLaborCost = 0;
    let totalBonusCost = 0;
    let totalFinalCost = 0;
    let totalFinalCostVat = 0;

    filteredReports.forEach((row) => {
      const workerCount = row.worker_count > 0 ? row.worker_count : 1;
      const workHours = calculateWorkHours(row.start_time, row.end_time);
      const baseLaborCost = workerCount * (row.hourly_rate || 0);
      const distanceCost = (row.distance_km || 0) * 1.5;
      const totalFoodCost = (row.food_cost || 0) * workerCount;
      const workersBonus = getReportBonus(row.worker_ids);
      const totalCost = baseLaborCost + workersBonus + distanceCost + totalFoodCost + (row.travel_cost || 0);
      const totalCostVat = totalCost * 1.17;
      const workersDisplay = getWorkersDisplay(row.worker_ids);
      const foodCostDisplay = row.food_cost > 0
        ? `${workerCount} ${workerCount === 1 ? 'עובד' : 'עובדים'} × ₪${Number(row.food_cost).toFixed(2)}`
        : '';

      totalLaborCost += baseLaborCost;
      totalBonusCost += workersBonus;
      totalFinalCost += totalCost;
      totalFinalCostVat += totalCostVat;

      const dataRow = worksheet.addRow({
        date: row.date,
        day: row.day,
        client: row.client,
        status: row.status === 'approved' ? 'מאושר' : 'בהמתנה',
        worker_count: workerCount,
        workers_display: workersDisplay,
        work_hours: workHours.toFixed(2),
        location: row.location,
        hourly_rate: row.hourly_rate || null,
        labor_cost: baseLaborCost || null,
        project_bonus: workersBonus || null,
        distance_km: row.distance_km || '',
        food_cost: foodCostDisplay,
        travel_cost: row.travel_cost || '',
        final_cost: totalCost || null,
        final_cost_vat: totalCostVat || null,
      });

      // Wrap text in workers column for multi-line display
      dataRow.getCell('workers_display').alignment = { wrapText: true, vertical: 'top' };

      // Currency formatting
      ['hourly_rate', 'labor_cost', 'project_bonus', 'final_cost', 'final_cost_vat'].forEach((key) => {
        const cell = dataRow.getCell(key);
        if (cell.value !== null && cell.value !== '') {
          cell.numFmt = '"₪"#,##0.00';
        }
      });
    });

    worksheet.addRow({});
    const totalsRow = worksheet.addRow({
      date: 'סה"כ לתשלום',
      labor_cost: totalLaborCost,
      project_bonus: totalBonusCost,
      final_cost: totalFinalCost,
      final_cost_vat: totalFinalCostVat,
    });

    ['labor_cost', 'project_bonus', 'final_cost', 'final_cost_vat'].forEach((key) => {
      const cell = totalsRow.getCell(key);
      if (cell.value !== null) cell.numFmt = '"₪"#,##0.00';
    });

    totalsRow.font = { bold: true };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', buildAttachmentFilenameHeader(`${project}_${month}.xlsx`));
    res.setHeader('Content-Length', buffer.length);

    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to generate Excel file' });
  }
});

const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    const isApiPath = req.path === '/dashboard'
      || req.path.startsWith('/auth/')
      || req.path.startsWith('/setup/')
      || req.path.startsWith('/manager/');

    if (isApiPath) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
