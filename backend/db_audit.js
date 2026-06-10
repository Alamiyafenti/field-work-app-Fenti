const { initializeDatabase, getDb } = require('./db');

async function runAudit() {
  await initializeDatabase();
  const db = getDb();

  const tablesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  const countsRes = db.exec("SELECT 'reports' AS table_name, COUNT(*) AS row_count FROM reports UNION ALL SELECT 'costs', COUNT(*) FROM costs");

  const invalidRowsRes = db.exec(
    "SELECT id, start_time, end_time, worker_count FROM reports WHERE start_time IS NULL OR end_time IS NULL OR length(start_time) != 5 OR length(end_time) != 5 OR worker_count < 1"
  );

  const recentReportsRes = db.exec(
    "SELECT id, project_name, client, date, start_time, end_time, worker_count, status FROM reports ORDER BY id DESC LIMIT 10"
  );

  const result = {
    tables: tablesRes[0] ? tablesRes[0].values.map((row) => row[0]) : [],
    counts: countsRes[0] ? countsRes[0].values : [],
    invalidRows: invalidRowsRes[0] ? invalidRowsRes[0].values : [],
    recentReports: recentReportsRes[0] ? recentReportsRes[0].values : [],
  };

  console.log(JSON.stringify(result, null, 2));
}

runAudit().catch((error) => {
  console.error('DB audit failed:', error);
  process.exit(1);
});
