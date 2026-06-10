import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import Toast from '../components/Toast';
import Modal from '../components/Modal';
import { API_URL } from '../config/api';

const SERIAL_ID_REGEX = /^\d{5,10}$/;
const PHONE_REGEX = /^\d{7,15}$/;

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Employees() {
  const [employees, setEmployees] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingEmployeeId, setExportingEmployeeId] = useState(null);
  const [summaryEmployeeId, setSummaryEmployeeId] = useState(null);
  const [summaryByEmployeeId, setSummaryByEmployeeId] = useState({});
  const [loadingSummaryId, setLoadingSummaryId] = useState(null);
  const [summaryStartDate, setSummaryStartDate] = useState('');
  const [summaryEndDate, setSummaryEndDate] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [editingForm, setEditingForm] = useState({ full_name: '', serial_id: '', phone_number: '', job_title: '', project_bonus: '', role: 'employee' });
  const [savingEditId, setSavingEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSerialId, setNewSerialId] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newProjectBonus, setNewProjectBonus] = useState('');
  const [newRole, setNewRole] = useState('employee');
  const [creatingEmployee, setCreatingEmployee] = useState(false);

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('currentUser') || 'null');
    } catch (error) {
      return null;
    }
  }, []);

  const authHeaders = useMemo(() => ({
    ...(currentUser?.serial_id && { 'x-user-serial-id': currentUser.serial_id }),
    ...(currentUser?.password && { 'x-user-password': currentUser.password }),
  }), [currentUser]);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: 'info' });

  const formatMoney = (value) => Number(value || 0).toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const statusLabel = (status) => {
    if (status === 'pending') return 'בהמתנה';
    if (status === 'approved') return 'מאושר';
    if (status === 'rejected') return 'נדחה';
    return status;
  };

  const summaryCacheKeyFor = useCallback(
    (employeeId) => `${employeeId}|${summaryStartDate || ''}|${summaryEndDate || ''}`,
    [summaryStartDate, summaryEndDate]
  );

  const getCurrentSummary = (employeeId) => summaryByEmployeeId[summaryCacheKeyFor(employeeId)];

  const handleCreateEmployee = async () => {
    if (!newName.trim() || !newSerialId.trim()) {
      showToast('יש למלא שם עובד ותעודת זהות', 'error');
      return;
    }
    if (!SERIAL_ID_REGEX.test(newSerialId.trim())) {
      showToast('תעודת זהות חייבת להכיל 5 עד 10 ספרות', 'error');
      return;
    }
    if (newPhone.trim() && !PHONE_REGEX.test(newPhone.trim())) {
      showToast('מספר טלפון חייב להכיל 7 עד 15 ספרות', 'error');
      return;
    }
    setCreatingEmployee(true);
    try {
      const response = await axios.post(
        `${API_URL}/manager/employees`,
        {
          full_name: newName.trim(),
          serial_id: newSerialId.trim(),
          phone_number: newPhone.trim(),
          job_title: newJobTitle.trim(),
          project_bonus: newProjectBonus !== '' ? parseFloat(newProjectBonus) : undefined,
          role: newRole,
        },
        { headers: authHeaders }
      );
      const createdRoleText = newRole === 'manager' ? ' כמנהל' : '';
      showToast(`העובד נוצר${createdRoleText}. סיסמא: ${response.data.employee.serial_id}`, 'success');
      setNewName('');
      setNewSerialId('');
      setNewPhone('');
      setNewJobTitle('');
      setNewProjectBonus('');
      setShowCreateForm(false);
      fetchEmployees();
    } catch (error) {
      showToast(error.response?.data?.error || 'יצירת עובד נכשלה', 'error');
      console.error(error);
    } finally {
      setCreatingEmployee(false);
    }
  };

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/manager/employees`, {
        params: searchTerm ? { search: searchTerm } : undefined,
        headers: authHeaders,
      });
      setEmployees(response.data.employees || []);
    } catch (error) {
      showToast('טעינת העובדים נכשלה', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, searchTerm]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const summary = useMemo(() => {
    const totalEmployees = employees.length;
    const totalReports = employees.reduce((sum, employee) => sum + (employee.total_reports || 0), 0);
    const totalHours = employees.reduce((sum, employee) => sum + (employee.total_hours || 0), 0);
    const projectSet = new Set();

    employees.forEach((employee) => {
      (employee.projects || []).forEach((projectName) => projectSet.add(projectName));
    });

    return {
      totalEmployees,
      totalReports,
      totalHours: Number(totalHours.toFixed(2)),
      totalProjects: projectSet.size,
      employeeNames: employees.map((employee) => employee.full_name),
    };
  }, [employees]);

  const getEmployeeSummary = useCallback(async (employeeId, forceRefresh = false) => {
    const cacheKey = summaryCacheKeyFor(employeeId);
    if (!forceRefresh && summaryByEmployeeId[cacheKey]) {
      return summaryByEmployeeId[cacheKey];
    }

    setLoadingSummaryId(employeeId);
    try {
      const response = await axios.get(`${API_URL}/manager/employees/${employeeId}/summary`, {
        params: {
          ...(summaryStartDate ? { start_date: summaryStartDate } : {}),
          ...(summaryEndDate ? { end_date: summaryEndDate } : {}),
        },
        headers: authHeaders,
      });

      const payload = {
        employee: response.data.employee,
        summary: response.data.summary,
        reports: response.data.reports,
      };

      setSummaryByEmployeeId((prev) => ({ ...prev, [cacheKey]: payload }));
      return payload;
    } catch (error) {
      showToast('טעינת סיכום העובד נכשלה', 'error');
      console.error(error);
      return null;
    } finally {
      setLoadingSummaryId(null);
    }
  }, [authHeaders, summaryByEmployeeId, summaryCacheKeyFor, summaryStartDate, summaryEndDate]);

  const handleToggleSummary = async (employeeId) => {
    if (summaryEmployeeId === employeeId) {
      setSummaryEmployeeId(null);
      return;
    }

    if (summaryStartDate && summaryEndDate && summaryStartDate > summaryEndDate) {
      showToast('טווח התאריכים אינו תקין', 'error');
      return;
    }

    const summaryData = await getEmployeeSummary(employeeId, true);
    if (summaryData) {
      setSummaryEmployeeId(employeeId);
    }
  };

  const handleExportSingleEmployee = async (employee) => {
    if (summaryStartDate && summaryEndDate && summaryStartDate > summaryEndDate) {
      showToast('טווח התאריכים אינו תקין', 'error');
      return;
    }

    setExportingEmployeeId(employee.id);
    try {
      const response = await axios.get(`${API_URL}/manager/employees/${employee.id}/export`, {
        params: {
          ...(summaryStartDate ? { start_date: summaryStartDate } : {}),
          ...(summaryEndDate ? { end_date: summaryEndDate } : {}),
        },
        headers: authHeaders,
        responseType: 'blob',
      });

      const blob = new Blob(
        [response.data],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const datePart = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute('download', `summary_employee_${employee.serial_id}_${datePart}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast('קובץ אקסל לעובד הורד בהצלחה', 'success');
    } catch (error) {
      showToast('ייצוא עובד לאקסל נכשל', 'error');
      console.error(error);
    } finally {
      setExportingEmployeeId(null);
    }
  };

  const handleStartEdit = (employee) => {
    setEditingEmployeeId(employee.id);
    setEditingForm({
      full_name: employee.full_name || '',
      serial_id: employee.serial_id || '',
      phone_number: employee.phone_number || '',
      job_title: employee.job_title || '',
      project_bonus: employee.project_bonus > 0 ? String(employee.project_bonus) : '',
      role: employee.role || 'employee',
    });
  };

  const handleCancelEdit = () => {
    setEditingEmployeeId(null);
    setEditingForm({ full_name: '', serial_id: '', phone_number: '', job_title: '', project_bonus: '', role: 'employee' });
  };

  const handleSaveEdit = async (employeeId) => {
    if (!editingForm.full_name.trim() || !editingForm.serial_id.trim()) {
      showToast('יש למלא שם עובד ותעודת זהות', 'error');
      return;
    }

    if (!SERIAL_ID_REGEX.test(editingForm.serial_id.trim())) {
      showToast('תעודת זהות חייבת להכיל 5 עד 10 ספרות', 'error');
      return;
    }

    if (editingForm.phone_number.trim() && !PHONE_REGEX.test(editingForm.phone_number.trim())) {
      showToast('מספר טלפון חייב להכיל 7 עד 15 ספרות', 'error');
      return;
    }

    setSavingEditId(employeeId);
    try {
      await axios.put(
        `${API_URL}/manager/employees/${employeeId}`,
        {
          full_name: editingForm.full_name.trim(),
          serial_id: editingForm.serial_id.trim(),
          phone_number: editingForm.phone_number.trim(),
          job_title: editingForm.job_title.trim(),
          project_bonus: editingForm.project_bonus !== '' ? parseFloat(editingForm.project_bonus) : 0,
          role: editingForm.role,
        },
        { headers: authHeaders }
      );

      const updatedRoleText = editingForm.role === 'manager' ? ' כמנהל' : '';
      showToast(`פרטי העובד עודכנו בהצלחה${updatedRoleText}`, 'success');
      handleCancelEdit();
      setSummaryByEmployeeId((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`${employeeId}|`)) {
            delete next[key];
          }
        });
        return next;
      });
      fetchEmployees();
    } catch (error) {
      showToast('עדכון העובד נכשל', 'error');
      console.error(error);
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDeleteEmployee = async (employee) => {
    const confirmed = window.confirm(`להסיר את המשתמש של ${employee.full_name}?`);
    if (!confirmed) return;

    setDeletingId(employee.id);
    try {
      await axios.delete(`${API_URL}/manager/employees/${employee.id}`, {
        headers: authHeaders,
      });
      showToast('העובד והמשתמש נמחקו בהצלחה', 'success');
      fetchEmployees();
    } catch (error) {
      showToast('מחיקת העובד נכשלה', 'error');
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportEmployees = () => {
    setExporting(true);
    try {
      const headers = ['שם עובד', 'תעודת זהות', 'טלפון', 'סה"כ דוחות', 'סה"כ שעות', 'סה"כ פרויקטים', 'פרויקטים'];
      const rows = employees.map((employee) => ([
        employee.full_name,
        employee.serial_id,
        employee.phone_number,
        employee.total_reports,
        employee.total_hours,
        employee.total_projects,
        (employee.projects || []).join(' | '),
      ]));

      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const datePart = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.setAttribute('download', `employees_summary_${datePart}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast('קובץ סיכום עובדים הורד בהצלחה', 'success');
    } catch (error) {
      showToast('ייצוא סיכום עובדים נכשל', 'error');
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page-shell">
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">רשימת עובדים</h1>
            <p className="page-subtitle">ניהול עובדים, סיכום פעילות ומחיקה</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="btn-primary mb-0"
          >
            {showCreateForm ? 'ביטול' : '+ עובד חדש'}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="card">
          <h2 className="card-title">הוספת עובד חדש</h2>
          <p className="card-subtitle">שם משתמש וסיסמא ייווצרו אוטומטית מתעודת הזהות</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="form-group mb-0">
              <label className="form-label">שם עובד</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className="form-input" placeholder="ישראל ישראלי" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">תעודת זהות</label>
              <input type="text" value={newSerialId} onChange={(e) => setNewSerialId(e.target.value.replace(/\D/g, ''))} className="form-input" placeholder="123456789" inputMode="numeric" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">טלפון</label>
              <input type="text" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))} className="form-input" placeholder="0501234567" inputMode="numeric" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">תפקיד</label>
              <input type="text" value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)} className="form-input" placeholder="ראש צוות" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">הרשאה</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="form-input">
                <option value="employee">עובד</option>
                <option value="manager">מנהל</option>
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="form-label">תוספת תפקיד (₪)</label>
              <input type="number" min="0" step="0.01" value={newProjectBonus} onChange={(e) => setNewProjectBonus(e.target.value)} className="form-input" placeholder="0" inputMode="decimal" />
            </div>
            <button type="button" onClick={handleCreateEmployee} disabled={creatingEmployee} className="btn-primary mb-0">
              {creatingEmployee ? 'יוצר...' : '+ צור עובד'}
            </button>
          </div>
        </div>
      )}

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white p-4 text-center shadow-sm">
          <div className="text-3xl font-extrabold">{summary.totalEmployees}</div>
          <div className="text-xs text-blue-200 mt-1 font-medium">עובדים</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-4 text-center shadow-sm">
          <div className="text-3xl font-extrabold">{summary.totalReports}</div>
          <div className="text-xs text-emerald-200 mt-1 font-medium">דוחות</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white p-4 text-center shadow-sm">
          <div className="text-3xl font-extrabold">{summary.totalHours}</div>
          <div className="text-xs text-violet-200 mt-1 font-medium">שעות</div>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-4 text-center shadow-sm">
          <div className="text-3xl font-extrabold">{summary.totalProjects}</div>
          <div className="text-xs text-amber-100 mt-1 font-medium">פרויקטים</div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title mb-0">סינון וחיפוש</h2>
          <button
            type="button"
            onClick={handleExportEmployees}
            disabled={exporting || employees.length === 0}
            className="btn-ghost btn-sm mb-0"
          >
            {exporting ? 'מייצא...' : '↓ ייצא CSV'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="form-group mb-0">
            <label htmlFor="summary-start-date" className="form-label">מתאריך</label>
            <input
              id="summary-start-date"
              type="date"
              value={summaryStartDate}
              onChange={(e) => setSummaryStartDate(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group mb-0">
            <label htmlFor="summary-end-date" className="form-label">עד תאריך</label>
            <input
              id="summary-end-date"
              type="date"
              value={summaryEndDate}
              onChange={(e) => setSummaryEndDate(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-group mb-0">
            <label htmlFor="employees-search" className="form-label">שם עובד</label>
            <input
              id="employees-search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              placeholder="חיפוש..."
            />
          </div>
          <button
            type="button"
            onClick={() => { setSummaryStartDate(''); setSummaryEndDate(''); setSummaryEmployeeId(null); }}
            className="btn-ghost btn-sm mb-0"
          >
            נקה סינון
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card text-center py-12"><div className="spinner" /></div>
      ) : employees.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">👤</div>
          <p className="text-gray-500 font-semibold">לא נמצאו עובדים</p>
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map((employee) => (
            <div key={employee.id} className="card">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
                  {getInitials(employee.full_name)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-base font-extrabold text-gray-900">{employee.full_name}</h3>
                    <span className="badge badge-info">תז {employee.serial_id}</span>
                    {employee.role === 'manager' && (
                      <span className="badge badge-info">מנהל</span>
                    )}
                    {employee.job_title && (
                      <span className="badge badge-warning">{employee.job_title}</span>
                    )}
                    {employee.project_bonus > 0 && (
                      <span className="text-xs text-emerald-600 font-semibold">+₪{employee.project_bonus} תוספת תפקיד</span>
                    )}
                    {employee.phone_number && (
                      <span className="text-xs text-gray-500">📞 {employee.phone_number}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    <span>📄 {employee.total_reports} דוחות</span>
                    <span>⏰ {employee.total_hours} שעות</span>
                    <span>📁 {employee.total_projects} פרויקטים</span>
                  </div>
                  {employee.projects && employee.projects.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {employee.projects.map((p) => (
                        <span key={p} className="badge badge-gray text-xs">{p}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleSummary(employee.id)}
                    disabled={loadingSummaryId === employee.id}
                    className="btn-ghost btn-sm mb-0 text-blue-600"
                  >
                    {loadingSummaryId === employee.id ? '...' : '📊 סיכום'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportSingleEmployee(employee)}
                    disabled={exportingEmployeeId === employee.id}
                    className="btn-ghost btn-sm mb-0 text-indigo-600"
                  >
                    {exportingEmployeeId === employee.id ? '...' : '↓ אקסל'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(employee)}
                    className="btn-ghost btn-sm mb-0 text-amber-600"
                  >
                    ✏️ ערוך
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEmployee(employee)}
                    disabled={deletingId === employee.id}
                    className="btn-ghost btn-sm mb-0 text-red-600"
                  >
                    {deletingId === employee.id ? '...' : '🗑️ מחק'}
                  </button>
                </div>
              </div>

              {editingEmployeeId === employee.id && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 items-end rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <div>
                    <label className="form-label">שם עובד</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingForm.full_name}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, full_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">תעודת זהות</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingForm.serial_id}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, serial_id: e.target.value.replace(/\D/g, '') }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="form-label">טלפון</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingForm.phone_number}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, phone_number: e.target.value.replace(/\D/g, '') }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="form-label">תפקיד</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingForm.job_title}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, job_title: e.target.value }))}
                      placeholder="ראש צוות"
                    />
                  </div>
                  <div>
                    <label className="form-label">הרשאה</label>
                    <select
                      className="form-input"
                      value={editingForm.role}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, role: e.target.value }))}
                    >
                      <option value="employee">עובד</option>
                      <option value="manager">מנהל</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">תוספת תפקיד (₪)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input"
                      value={editingForm.project_bonus}
                      onChange={(e) => setEditingForm((prev) => ({ ...prev, project_bonus: e.target.value }))}
                      placeholder="0"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(employee.id)}
                      disabled={savingEditId === employee.id}
                      className="btn-success mb-0 flex-1"
                    >
                      {savingEditId === employee.id ? '...' : 'שמור'}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="btn-ghost btn-sm mb-0 flex-1"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {summaryEmployeeId && getCurrentSummary(summaryEmployeeId) && (
        <Modal
          isOpen={true}
          title={`סיכום עובד: ${employees.find((e) => e.id === summaryEmployeeId)?.full_name}`}
          onClose={() => setSummaryEmployeeId(null)}
        >
          <div className="page-shell">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
                <div className="text-xs text-gray-600 font-semibold">סה"כ דוחות</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">{getCurrentSummary(summaryEmployeeId).summary.total_reports}</div>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <div className="text-xs text-gray-600 font-semibold">מאושרים</div>
                <div className="text-2xl font-bold text-green-700 mt-1">{getCurrentSummary(summaryEmployeeId).summary.approved_reports}</div>
              </div>
              <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 text-center">
                <div className="text-xs text-gray-600 font-semibold">סה"כ שעות</div>
                <div className="text-2xl font-bold text-purple-700 mt-1">{getCurrentSummary(summaryEmployeeId).summary.total_hours}</div>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-center">
                <div className="text-xs text-gray-600 font-semibold">פרויקטים</div>
                <div className="text-2xl font-bold text-orange-700 mt-1">{getCurrentSummary(summaryEmployeeId).summary.total_projects}</div>
              </div>
              {getCurrentSummary(summaryEmployeeId).summary.project_bonus > 0 ? (
                <>
                  <div className="rounded-lg bg-gray-100 border border-gray-300 p-3 text-center">
                    <div className="text-xs text-gray-600 font-semibold">תשלום בסיסי</div>
                    <div className="text-2xl font-bold text-gray-700 mt-1">{formatMoney(getCurrentSummary(summaryEmployeeId).summary.total_base_pay).split('.')[0]}</div>
                    <div className="text-xs text-gray-500 mt-0.5">ש"ח</div>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
                    <div className="text-xs text-gray-600 font-semibold">+תוספת תפקיד ({getCurrentSummary(summaryEmployeeId).summary.approved_reports} × ₪{getCurrentSummary(summaryEmployeeId).summary.project_bonus})</div>
                    <div className="text-2xl font-bold text-amber-700 mt-1">+{formatMoney(getCurrentSummary(summaryEmployeeId).summary.total_project_bonus).split('.')[0]}</div>
                    <div className="text-xs text-amber-600 mt-0.5">ש"ח</div>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                    <div className="text-xs text-gray-600 font-semibold">סה"כ לתשלום</div>
                    <div className="text-2xl font-bold text-red-700 mt-1">{formatMoney(getCurrentSummary(summaryEmployeeId).summary.total_pay_due).split('.')[0]}</div>
                    <div className="text-xs text-red-600 mt-0.5">ש"ח</div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                  <div className="text-xs text-gray-600 font-semibold">לתשלום</div>
                  <div className="text-2xl font-bold text-red-700 mt-1">{formatMoney(getCurrentSummary(summaryEmployeeId).summary.total_pay_due).split('.')[0]}</div>
                  <div className="text-xs text-red-600 mt-0.5">ש"ח</div>
                </div>
              )}
            </div>

            {getCurrentSummary(summaryEmployeeId).reports.length === 0 ? (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-6 text-center text-gray-600">אין דוחות לעובד זה בתקופה הנבחרת</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-100 to-indigo-100 border-b-2 border-blue-300">
                      <th className="p-3 text-right font-bold text-gray-900">תאריך</th>
                      <th className="p-3 text-right font-bold text-gray-900">פרויקט</th>
                      <th className="p-3 text-center font-bold text-gray-900">סטטוס</th>
                      <th className="p-3 text-center font-bold text-gray-900">שעות</th>
                      <th className="p-3 text-center font-bold text-gray-900">תעריף</th>
                      {getCurrentSummary(summaryEmployeeId).summary.project_bonus > 0 && (
                        <th className="p-3 text-center font-bold text-amber-800">תוספת תפקיד</th>
                      )}
                      <th className="p-3 text-center font-bold text-gray-900">סה"כ כולל מע"מ</th>
                      <th className="p-3 text-center font-bold text-gray-900">תשלום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCurrentSummary(summaryEmployeeId).reports.map((report, idx) => (
                      <tr key={report.id} className={`border-b ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-blue-50 transition`}>
                        <td className="p-3 text-sm text-gray-700">{report.date}</td>
                        <td className="p-3 text-sm text-gray-700">{report.project_name}</td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                              report.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : report.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {statusLabel(report.status)}
                          </span>
                        </td>
                        <td className="p-3 text-center text-sm font-semibold text-gray-900">{report.work_hours}</td>
                        <td className="p-3 text-center text-sm font-semibold text-gray-900">{formatMoney(report.daily_rate)}</td>
                        {getCurrentSummary(summaryEmployeeId).summary.project_bonus > 0 && (
                          <td className="p-3 text-center text-sm font-semibold text-amber-700">
                            {report.status === 'approved' ? `+₪${report.project_bonus}` : '—'}
                          </td>
                        )}
                        <td className="p-3 text-center text-sm font-semibold text-gray-900">{formatMoney(report.total_share_with_vat)}</td>
                        <td className="p-3 text-center text-sm font-bold text-blue-700">{formatMoney(report.pay_due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default Employees;
