import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

const STATUS_LABELS = { pending: 'בהמתנה', approved: 'מאושר', rejected: 'נדחה' };
const STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border border-red-200',
};

function formatLocalDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function formatMonthHebrew(monthStr) {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  return `${months[parseInt(month, 10) - 1]} ${year}`;
}

function StatCard({ icon, label, value, suffix, gradient }) {
  return (
    <div className={`rounded-2xl p-5 shadow-md text-white ${gradient}`}>
      <div className="text-3xl mb-3">{icon}</div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-extrabold leading-none">{value}</span>
        {suffix && <span className="text-base font-medium opacity-80 mb-0.5">{suffix}</span>}
      </div>
      <div className="text-sm opacity-85 mt-2 font-medium">{label}</div>
    </div>
  );
}

function StatCardLight({ icon, label, value, suffix, accent }) {
  return (
    <div className={`rounded-2xl p-5 bg-white border-2 ${accent} shadow-sm`}>
      <div className="text-3xl mb-3">{icon}</div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-extrabold leading-none text-gray-800">{value}</span>
        {suffix && <span className="text-base font-medium text-gray-400 mb-0.5">{suffix}</span>}
      </div>
      <div className="text-sm text-gray-500 mt-2 font-medium">{label}</div>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isManager = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      return u?.role === 'manager';
    } catch { return false; }
  }, []);

  const currentUserName = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
      return u?.full_name || '';
    } catch { return ''; }
  }, []);

  const fetchData = async () => {
    try {
      const res = await axios.get(`${API_URL}/dashboard`);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError('טעינת לוח הבקרה נכשלה');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-gray-500 font-medium">טוען נתונים...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-section bg-red-50 border border-red-200">
        <div className="text-red-700 font-semibold mb-3">{error}</div>
        <button type="button" onClick={fetchData} className="btn-primary w-auto px-6">נסה שוב</button>
      </div>
    );
  }

  const cols = isManager ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="page-shell">
      <div className="page-header">
        <h1 className="page-title">לוח בקרה</h1>
        <p className="page-subtitle">
          {currentUserName ? `שלום, ${currentUserName} · ` : ''}
          {formatLocalDate(data?.today)}
        </p>
      </div>

      {/* ── Today ── */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pr-1">היום</h2>
        <div className={`grid gap-4 ${cols}`}>
          <StatCard icon="📋" label="דוחות היום" value={data?.total_reports_today ?? 0} gradient="bg-gradient-to-br from-blue-500 to-blue-700" />
          <StatCard icon="⏱️" label="שעות היום" value={data?.total_hours_today ?? 0} suffix="שע׳" gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" />
          {isManager && (
            <StatCard icon="💰" label="עלות היום" value={(data?.total_cost_today ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })} suffix="₪" gradient="bg-gradient-to-br from-purple-500 to-purple-700" />
          )}
        </div>
      </section>

      {/* ── This month ── */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 pr-1">
          {formatMonthHebrew(data?.current_month)}
        </h2>
        <div className={`grid gap-4 ${cols}`}>
          <StatCardLight icon="📅" label="דוחות החודש" value={data?.total_reports_month ?? 0} accent="border-blue-100" />
          <StatCardLight icon="🕐" label="שעות החודש" value={data?.total_hours_month ?? 0} suffix="שע׳" accent="border-emerald-100" />
          {isManager && (
            <StatCardLight icon="📊" label="עלות החודש" value={(data?.total_cost_month ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 2 })} suffix="₪" accent="border-purple-100" />
          )}
        </div>
      </section>

      {/* ── Recent reports ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="card-title mb-0">דוחות אחרונים</h2>
          <button
            type="button"
            onClick={fetchData}
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
          >
            רענון ↻
          </button>
        </div>

        {!data?.recent_reports?.length ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">📭</div>
            <div className="font-medium">אין דוחות עדיין</div>
          </div>
        ) : (
          <div className="space-y-2">
            {data.recent_reports.map((report) => (
              <div
                key={report.id}
                className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4 hover:bg-white hover:border-gray-200 hover:shadow-sm transition-all cursor-default"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-bold text-gray-900 truncate">{report.project_name}</span>
                    <span className="text-gray-300 hidden sm:inline">·</span>
                    <span className="text-gray-500 text-sm truncate">{report.client}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                    <span>📅 {formatLocalDate(report.date)}{report.day ? ` (${report.day})` : ''}</span>
                    <span>👷 {report.worker_count} עובדים</span>
                    <span>⏰ {report.start_time}–{report.end_time}</span>
                    {report.location && <span className="truncate">📍 {report.location}</span>}
                  </div>
                </div>
                <span className={`shrink-0 self-start px-2.5 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[report.status] || STATUS_STYLES.pending}`}>
                  {STATUS_LABELS[report.status] || report.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
