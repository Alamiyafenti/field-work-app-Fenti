const { getDb } = require('./db');

function getUserFromHeaders(req) {
  const serialId = (req.headers['x-user-serial-id'] || '').toString().trim();
  const password = (req.headers['x-user-password'] || '').toString();

  if (!serialId || !password) {
    return null;
  }

  const db = getDb();
  if (!db) {
    return null;
  }

  const result = db.exec(
    'SELECT id, serial_id, role, full_name, is_active, phone_number FROM users WHERE serial_id = ? AND password = ? LIMIT 1',
    [serialId, password]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const row = result[0].values[0];
  if (!row[4]) {
    return null;
  }

  return {
    id: row[0],
    serial_id: row[1],
    role: row[2],
    full_name: row[3],
    phone_number: row[5] || '',
  };
}

const requireAuthenticatedUser = (req, res, next) => {
  const user = getUserFromHeaders(req);
  if (!user) {
    return res.status(403).json({ error: 'Unauthorized access' });
  }

  req.authUser = user;
  return next();
};

const requireManagerAccess = (req, res, next) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'manager') {
    return res.status(403).json({ error: 'Unauthorized access to manager features' });
  }

  req.authUser = user;
  return next();
};

const requireEmployeeAccess = (req, res, next) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'employee') {
    return res.status(403).json({ error: 'Unauthorized access to employee features' });
  }

  req.authUser = user;
  return next();
};

module.exports = { requireAuthenticatedUser, requireManagerAccess, requireEmployeeAccess };
