import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import Toast from '../components/Toast';
import { API_URL } from '../config/api';

const PROJECT_CLIENT_STORAGE_KEY = 'managedProjectClients';
const SERIAL_ID_REGEX = /^\d{5,10}$/;
const PHONE_REGEX = /^\d{7,15}$/;

function parseWorkerIds(rawValue) {
  if (rawValue === undefined || rawValue === null) return [];
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0);
      }
    } catch (error) {
      // fallback to splitting simple comma / whitespace lists
    }

    return trimmed
      .split(/[\s,]+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  }

  return [];
}

const STATUS_META = {
  pending:  { label: 'בהמתנה', badge: 'badge badge-pending',  border: 'border-amber-200   bg-amber-50/40'   },
  approved: { label: 'מאושר',  badge: 'badge badge-approved', border: 'border-emerald-200 bg-emerald-50/40' },
  rejected: { label: 'נדחה',   badge: 'badge badge-rejected', border: 'border-red-200     bg-red-50/40'     },
};

function SectionTab({ label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
        active ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {label}
      {count != null && (
        <span className={`text-xs rounded-full px-2 py-0.5 font-black ${active ? 'bg-white/25' : 'bg-gray-200 text-gray-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function Manager({ currentUser }) {
  const [activeTab, setActiveTab] = useState('reports');
  const [pendingReports, setPendingReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [costs, setCosts] = useState({
    daily_rate: '',
    distance_km: '',
    food_cost: '',
    travel_cost: '',
  });
  const [calculatedCosts, setCalculatedCosts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectClientCatalog, setProjectClientCatalog] = useState([]);
  const [catalogProjectInput, setCatalogProjectInput] = useState('');
  const [catalogClientInput, setCatalogClientInput] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [reportEdit, setReportEdit] = useState({
    project_name: '',
    client: '',
    date: '',
    location: '',
    start_time: '',
    end_time: '',
    worker_ids: [],
  });

  const selectedWorkerIds = useMemo(() => {
    const editedIds = parseWorkerIds(reportEdit.worker_ids);
    if (editedIds.length > 0) return editedIds;
    return parseWorkerIds(selectedReport?.worker_ids);
  }, [reportEdit.worker_ids, selectedReport?.worker_ids]);

  const selectedWorkerCount = selectedWorkerIds.length;
  const workerCount = selectedWorkerCount > 0 ? selectedWorkerCount : (selectedReport?.worker_count || 0);
  const selectedWorkerProjectBonus = useMemo(
    () => employeeOptions.reduce((sum, employee) => {
      if (selectedWorkerIds.includes(Number(employee.id))) {
        return sum + (Number(employee.project_bonus) || 0);
      }
      return sum;
    }, 0),
    [selectedWorkerIds, employeeOptions]
  );

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: 'info' });

  const getAuthHeaders = useCallback(() => ({
    ...(currentUser?.serial_id && { 'x-user-serial-id': currentUser.serial_id }),
    ...(currentUser?.password && { 'x-user-password': currentUser.password }),
  }), [currentUser]);

  const saveProjectClientCatalog = (entries) => {
    localStorage.setItem(PROJECT_CLIENT_STORAGE_KEY, JSON.stringify(entries));
    setProjectClientCatalog(entries);
  };

  const handleAddProjectClient = () => {
    const projectName = catalogProjectInput.trim();
    const clientName = catalogClientInput.trim();

    if (!projectName || !clientName) {
      showToast('יש למלא גם שם פרויקט וגם שם לקוח', 'error');
      return;
    }

    const alreadyExists = projectClientCatalog.some(
      (entry) => entry.project_name === projectName && entry.client === clientName
    );

    if (alreadyExists) {
      showToast('הפרויקט והלקוח כבר קיימים ברשימה', 'info');
      return;
    }

    const nextCatalog = [{ project_name: projectName, client: clientName }, ...projectClientCatalog];
    saveProjectClientCatalog(nextCatalog);
    setCatalogProjectInput('');
    setCatalogClientInput('');
    showToast('הפרויקט והלקוח נוספו לרשימה', 'success');
  };

  const handleDeleteProjectClient = (index) => {
    const nextCatalog = projectClientCatalog.filter((_, idx) => idx !== index);
    saveProjectClientCatalog(nextCatalog);
    showToast('הרשומה הוסרה מהרשימה', 'info');
  };

  const fetchPendingReports = useCallback(async (status = 'pending') => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/manager/reports`, {
        params: { status },
        headers: getAuthHeaders(),
      });
      setPendingReports(response.data);
    } catch (error) {
      showToast('טעינת הדוחות נכשלה', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchPendingReports(statusFilter);

    const savedCatalog = JSON.parse(localStorage.getItem(PROJECT_CLIENT_STORAGE_KEY) || '[]');
    setProjectClientCatalog(Array.isArray(savedCatalog) ? savedCatalog : []);
  }, [statusFilter, fetchPendingReports]);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const response = await axios.get(`${API_URL}/employees`, {
          headers: getAuthHeaders(),
        });
        setEmployeeOptions(response.data.employees || []);
      } catch (error) {
        console.error('Employees load error:', error);
      }
    };

    loadEmployees();
  }, [getAuthHeaders]);

  const handleSelectReport = async (report) => {
    try {
      const response = await axios.get(`${API_URL}/manager/reports/${report.id}`, {
        headers: getAuthHeaders(),
      });

      setSelectedReport(response.data);
      setReportEdit({
        project_name: response.data.project_name || '',
        client: response.data.client || '',
        date: response.data.date || '',
        location: response.data.location || '',
        start_time: response.data.start_time || '',
        end_time: response.data.end_time || '',
        worker_ids: parseWorkerIds(response.data.worker_ids),
      });
      setCosts({
        daily_rate: response.data.cost?.hourly_rate || '',
        distance_km: response.data.cost?.distance_km || '',
        food_cost: response.data.cost?.food_cost || '',
        travel_cost: response.data.cost?.travel_cost || '',
      });
    } catch (error) {
      showToast('טעינת פרטי דוח נכשלה', 'error');
      console.error(error);
    }
  };

  const calculateCosts = useCallback(() => {
    if (!selectedReport) return;

    const editedCount = (reportEdit.worker_ids || []).filter((id) => Number.isInteger(Number(id)) && Number(id) > 0).length;
    const workerCount = editedCount > 0 ? editedCount : (selectedReport.worker_count || 0);
    const dailyRate = parseFloat(costs.daily_rate || 0);
    const distanceKm = parseFloat(costs.distance_km || 0);
    const foodCostPerEmployee = parseFloat(costs.food_cost || 0);
    const travelCost = parseFloat(costs.travel_cost || 0);

    const laborCost = workerCount * dailyRate;
    const distanceCost = distanceKm * 1.5;
    const foodCostTotal = foodCostPerEmployee * workerCount;
    const bonusCost = selectedWorkerProjectBonus || selectedReport.cost?.project_bonus || 0;
    const finalCost = laborCost + distanceCost + foodCostTotal + travelCost + bonusCost;
    const finalCostVat = finalCost * 1.17;

    setCalculatedCosts({
      labor_cost: laborCost.toFixed(2),
      distance_cost: distanceCost.toFixed(2),
      distance_km: distanceKm,
      food_cost_per_employee: foodCostPerEmployee.toFixed(2),
      food_cost: foodCostTotal.toFixed(2),
      travel_cost: travelCost.toFixed(2),
      bonus_cost: bonusCost.toFixed(2),
      final_cost: finalCost.toFixed(2),
      final_cost_vat: finalCostVat.toFixed(2),
    });
  }, [selectedReport, costs, reportEdit, selectedWorkerProjectBonus]);

  useEffect(() => {
    calculateCosts();
  }, [calculateCosts]);

  const handleSaveAndApprove = async () => {
    if (!selectedReport) return;

    const requiredReportFields = [
      reportEdit.project_name,
      reportEdit.client,
      reportEdit.date,
      reportEdit.location,
      reportEdit.start_time,
      reportEdit.end_time,
    ];

    if (requiredReportFields.some((value) => !String(value || '').trim())) {
      showToast('יש למלא את כל פרטי הדוח לפני אישור', 'error');
      return;
    }

    if (reportEdit.start_time === reportEdit.end_time) {
      showToast('שעת סיום לא יכולה להיות זהה לשעת התחלה', 'error');
      return;
    }

    if (!Array.isArray(reportEdit.worker_ids) || reportEdit.worker_ids.length < 1) {
      showToast('יש לבחור לפחות עובד אחד', 'error');
      return;
    }

    const validWorkerIdsForApprove = reportEdit.worker_ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (validWorkerIdsForApprove.length < 1) {
      showToast('יש לבחור לפחות עובד אחד', 'error');
      return;
    }

    const uniqueWorkerIds = new Set(validWorkerIdsForApprove);
    if (uniqueWorkerIds.size !== validWorkerIdsForApprove.length) {
      showToast('לא ניתן לבחור את אותו עובד פעמיים', 'error');
      return;
    }

    if ([costs.daily_rate, costs.distance_km, costs.food_cost, costs.travel_cost].some((value) => value === '' || value === null || value === undefined)) {
      showToast('יש למלא את כל שדות העלות לפני אישור', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        status: 'approved',
        project_name: reportEdit.project_name.trim(),
        client: reportEdit.client.trim(),
        date: reportEdit.date,
        location: reportEdit.location.trim(),
        start_time: reportEdit.start_time,
        end_time: reportEdit.end_time,
        worker_ids: validWorkerIdsForApprove,
        daily_rate: parseFloat(costs.daily_rate),
        distance_km: parseFloat(costs.distance_km),
        food_cost: parseFloat(costs.food_cost),
        travel_cost: parseFloat(costs.travel_cost),
      };

      await axios.put(
        `${API_URL}/manager/reports/${selectedReport.id}`,
        payload,
        { headers: getAuthHeaders() }
      );

      showToast('הדוח אושר ונשמר בהצלחה', 'success');
      setPendingReports((prev) => prev.filter((r) => r.id !== selectedReport.id));
      setSelectedReport(null);
      setCosts({ daily_rate: '', distance_km: '', food_cost: '', travel_cost: '' });
    } catch (error) {
      showToast('שמירת הדוח נכשלה', 'error');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleRejectReport = async () => {
    if (!selectedReport) return;

    setSaving(true);
    try {
      await axios.put(
        `${API_URL}/manager/reports/${selectedReport.id}`,
        { status: 'rejected' },
        { headers: getAuthHeaders() }
      );

      showToast('הדוח נדחה בהצלחה', 'success');
      setPendingReports((prev) => prev.filter((r) => r.id !== selectedReport.id));
      setSelectedReport(null);
      setCosts({ daily_rate: '', distance_km: '', food_cost: '', travel_cost: '' });
    } catch (error) {
      showToast('דחיית הדוח נכשלה', 'error');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveReportEdits = async () => {
    if (!selectedReport) return;

    const requiredReportFields = [
      reportEdit.project_name,
      reportEdit.client,
      reportEdit.date,
      reportEdit.location,
      reportEdit.start_time,
      reportEdit.end_time,
    ];

    if (requiredReportFields.some((value) => !String(value || '').trim())) {
      showToast('יש למלא את כל פרטי הדוח לפני שמירה', 'error');
      return;
    }

    if (reportEdit.start_time === reportEdit.end_time) {
      showToast('שעת סיום לא יכולה להיות זהה לשעת התחלה', 'error');
      return;
    }

    const validWorkerIds = (reportEdit.worker_ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    const uniqueWorkerIds = new Set(validWorkerIds);
    if (validWorkerIds.length > 0 && uniqueWorkerIds.size !== validWorkerIds.length) {
      showToast('לא ניתן לבחור את אותו עובד פעמיים', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_name: reportEdit.project_name.trim(),
        client: reportEdit.client.trim(),
        date: reportEdit.date,
        location: reportEdit.location.trim(),
        start_time: reportEdit.start_time,
        end_time: reportEdit.end_time,
      };

      if (validWorkerIds.length > 0) payload.worker_ids = validWorkerIds;
      if (costs.daily_rate !== '') payload.daily_rate = parseFloat(costs.daily_rate);
      if (costs.distance_km !== '') payload.distance_km = parseFloat(costs.distance_km);
      if (costs.food_cost !== '') payload.food_cost = parseFloat(costs.food_cost);
      if (costs.travel_cost !== '') payload.travel_cost = parseFloat(costs.travel_cost);

      await axios.put(`${API_URL}/manager/reports/${selectedReport.id}`, payload, {
        headers: getAuthHeaders(),
      });

      showToast('שינויי הדוח נשמרו בהצלחה', 'success');
      setSelectedReport(null);
      setCosts({ daily_rate: '', distance_km: '', food_cost: '', travel_cost: '' });
      await fetchPendingReports(statusFilter);
    } catch (error) {
      showToast(error.response?.data?.error || 'שמירת השינויים נכשלה', 'error');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const normalizeText = (value) => String(value || '').toLowerCase();

  const filteredReports = pendingReports.filter((report) => {
    const search = normalizeText(searchTerm.trim());
    if (!search) return true;

    const haystack = [report.project_name, report.client, report.location, report.day]
      .map(normalizeText)
      .join(' ');
    return haystack.includes(search);
  });

  const statusLabel = (status) => {
    if (status === 'pending') return 'בהמתנה';
    if (status === 'approved') return 'מאושר';
    if (status === 'rejected') return 'נדחה';
    return status;
  };

  if (!selectedReport) {
    return (
      <div className="page-shell">
        <Toast message={toast.message} type={toast.type} onClose={clearToast} />

        <div className="page-header">
          <h1 className="page-title">פאנל מנהל</h1>
          <p className="page-subtitle">ניהול עובדים, פרויקטים ואישור דוחות</p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 flex-wrap">
          <SectionTab label="📋 דוחות" active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} count={pendingReports.length || null} />
          <SectionTab label="🗂️ פרויקטים" active={activeTab === 'projects'} onClick={() => setActiveTab('projects')} count={projectClientCatalog.length || null} />
        </div>

        {/* ── Projects/Clients tab ── */}
        {activeTab === 'projects' && (
          <div className="card">
            <h2 className="card-title">ניהול פרויקטים ולקוחות</h2>
            <p className="card-subtitle">יש להוסיף פרויקט ולקוח לפני שמגישים דוח עבודה</p>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end mb-6">
              <div className="form-group mb-0 md:col-span-2">
                <label htmlFor="catalog-project" className="form-label">שם פרויקט</label>
                <input id="catalog-project" type="text" value={catalogProjectInput} onChange={(e) => setCatalogProjectInput(e.target.value)} className="form-input" placeholder="תחזוקת אתר" />
              </div>
              <div className="form-group mb-0 md:col-span-2">
                <label htmlFor="catalog-client" className="form-label">שם לקוח</label>
                <input id="catalog-client" type="text" value={catalogClientInput} onChange={(e) => setCatalogClientInput(e.target.value)} className="form-input" placeholder="עיריית חיפה" />
              </div>
              <button type="button" onClick={handleAddProjectClient} className="btn-primary mb-0">+ הוסף</button>
            </div>

            {projectClientCatalog.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 text-center">
                אין עדיין פרויקטים. הוסף פרויקט ולקוח למעלה.
              </div>
            ) : (
              <div className="space-y-2">
                {projectClientCatalog.map((entry, index) => (
                  <div key={`${entry.project_name}-${entry.client}-${index}`} className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">
                        {index + 1}
                      </span>
                      <span>
                        <span className="font-bold text-gray-900">{entry.project_name}</span>
                        <span className="text-gray-400 mx-2">|</span>
                        <span className="text-gray-600">{entry.client}</span>
                      </span>
                    </div>
                    <button type="button" onClick={() => handleDeleteProjectClient(index)} className="btn-ghost btn-sm text-red-500 hover:bg-red-50 mb-0">הסר</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Reports tab ── */}
        {activeTab === 'reports' && (
          <>
            <div className="card">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="form-group mb-0">
                  <label htmlFor="manager-status-filter" className="form-label">סטטוס</label>
                  <select id="manager-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-input">
                    <option value="all">הכל</option>
                    <option value="pending">בהמתנה</option>
                    <option value="approved">מאושר</option>
                    <option value="rejected">נדחה</option>
                  </select>
                </div>
                <div className="form-group mb-0 md:col-span-3">
                  <label htmlFor="manager-search" className="form-label">חיפוש</label>
                  <input id="manager-search" type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="form-input" placeholder="🔍 חיפוש לפי פרויקט, לקוח, מיקום..." />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="card text-center py-12"><div className="spinner" /></div>
            ) : pendingReports.length === 0 ? (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-gray-500 font-semibold">לא נמצאו דוחות בסטטוס שנבחר</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="card text-center py-12">
                <div className="text-4xl mb-3">🔍</div>
                <p className="text-gray-500 font-semibold">לא נמצאו תוצאות לחיפוש</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.map((report) => {
                  const meta = STATUS_META[report.status] || STATUS_META.pending;
                  return (
                    <div
                      key={report.id}
                      className={`card border-2 cursor-pointer hover:shadow-md transition-all ${meta.border}`}
                      onClick={() => handleSelectReport(report)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-gray-900 text-base">{report.project_name}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-500 text-sm">{report.client}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span>📅 {report.date}{report.day ? ` (${report.day})` : ''}</span>
                            <span>👷 {report.worker_count} עובדים</span>
                            <span>⏰ {report.start_time}–{report.end_time}</span>
                            <span>📍 {report.location}</span>
                          </div>
                        </div>
                        <span className={meta.badge}>{meta.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  const meta = STATUS_META[selectedReport.status] || STATUS_META.pending;

  return (
    <div className="page-shell">
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className="flex items-center gap-4">
        <button onClick={() => setSelectedReport(null)} className="btn-ghost btn-sm mb-0">
          ← חזרה
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-gray-900">{selectedReport.project_name}</h1>
          <p className="text-sm text-gray-500">{selectedReport.client} · {selectedReport.date}</p>
        </div>
        <span className={`${meta.badge} mr-auto`}>{meta.label}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Report Details ── */}
        <div className="card space-y-3">
          <h2 className="card-title">✏️ עריכת פרטי הדוח</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-group mb-0">
              <label className="form-label">פרויקט</label>
              <input type="text" value={reportEdit.project_name} onChange={(e) => setReportEdit((p) => ({ ...p, project_name: e.target.value }))} className="form-input" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">לקוח</label>
              <input type="text" value={reportEdit.client} onChange={(e) => setReportEdit((p) => ({ ...p, client: e.target.value }))} className="form-input" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-group mb-0">
              <label className="form-label">תאריך</label>
              <input type="date" value={reportEdit.date} onChange={(e) => setReportEdit((p) => ({ ...p, date: e.target.value }))} className="form-input" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">מיקום</label>
              <input type="text" value={reportEdit.location} onChange={(e) => setReportEdit((p) => ({ ...p, location: e.target.value }))} className="form-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group mb-0">
              <label className="form-label">שעת התחלה</label>
              <input type="time" value={reportEdit.start_time} onChange={(e) => setReportEdit((p) => ({ ...p, start_time: e.target.value }))} className="form-input" />
            </div>
            <div className="form-group mb-0">
              <label className="form-label">שעת סיום</label>
              <input type="time" value={reportEdit.end_time} onChange={(e) => setReportEdit((p) => ({ ...p, end_time: e.target.value }))} className="form-input" />
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-2 text-sm text-blue-800 font-semibold">
            ⏱ סה"כ שעות עבודה: {selectedReport.work_hours?.toFixed(2)}
          </div>

          <div className="form-group mb-0">
            <label className="form-label">עובדים בדוח</label>
            <div className="space-y-2">
              {reportEdit.worker_ids.map((workerId, idx) => (
                <select
                  key={`worker-${idx}`}
                  value={workerId || ''}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setReportEdit((prev) => {
                      const nextIds = [...prev.worker_ids];
                      nextIds[idx] = Number.isInteger(value) ? value : 0;
                      return { ...prev, worker_ids: nextIds.filter((id) => Number.isInteger(id) && id > 0) };
                    });
                  }}
                  className="form-input"
                >
                  <option value="">בחר עובד</option>
                  {employeeOptions
                    .filter((option) => {
                      const selectedElsewhere = reportEdit.worker_ids.some((id, i) => i !== idx && Number(id) === Number(option.id));
                      return !selectedElsewhere || Number(option.id) === Number(workerId);
                    })
                    .map((option) => (
                      <option key={option.id} value={option.id}>{option.full_name}</option>
                    ))}
                </select>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setReportEdit((p) => ({ ...p, worker_ids: [...p.worker_ids, 0] }))} className="btn-ghost btn-sm mb-0 text-blue-600">+ הוסף עובד</button>
              <button type="button" onClick={() => setReportEdit((p) => ({ ...p, worker_ids: p.worker_ids.length > 1 ? p.worker_ids.slice(0, -1) : p.worker_ids }))} className="btn-ghost btn-sm mb-0 text-red-600">− הסר עובד</button>
            </div>
          </div>
        </div>

        {/* ── Right: Cost Calculation ── */}
        <div className="card space-y-3">
          <h2 className="card-title">💰 חישוב עלויות</h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group mb-0">
              <label htmlFor="daily_rate" className="form-label">תעריף יומי (ש"ח)</label>
              <input type="number" id="daily_rate" value={costs.daily_rate} onChange={(e) => setCosts({ ...costs, daily_rate: e.target.value })} className="form-input" placeholder="0.00" step="0.01" min="0" inputMode="decimal" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="distance_km" className="form-label">מרחק (ק"מ) × 1.5 ₪</label>
              <input type="number" id="distance_km" value={costs.distance_km} onChange={(e) => setCosts({ ...costs, distance_km: e.target.value })} className="form-input" placeholder="0.00" step="0.01" min="0" inputMode="decimal" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="food_cost" className="form-label">עלות אוכל לכל עובד (ש"ח)</label>
              <input type="number" id="food_cost" value={costs.food_cost} onChange={(e) => setCosts({ ...costs, food_cost: e.target.value })} className="form-input" placeholder="0.00" step="0.01" min="0" inputMode="decimal" />
            </div>
            <div className="form-group mb-0">
              <label htmlFor="travel_cost" className="form-label">עלות נסיעה (ש"ח)</label>
              <input type="number" id="travel_cost" value={costs.travel_cost} onChange={(e) => setCosts({ ...costs, travel_cost: e.target.value })} className="form-input" placeholder="0.00" step="0.01" min="0" inputMode="decimal" />
            </div>
          </div>

          {calculatedCosts && (
            <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-4 space-y-2">
              <h3 className="font-bold text-blue-900 text-sm uppercase tracking-wide">סיכום חישוב</h3>
              <div className="text-sm space-y-1 text-gray-700">
                <div className="flex justify-between">
                  <span>עלות עבודה</span>
                  <span className="font-semibold">₪{calculatedCosts.labor_cost}</span>
                </div>
                {calculatedCosts.distance_km > 0 && (
                  <div className="flex justify-between">
                    <span>{calculatedCosts.distance_km} ק"מ × ₪1.5</span>
                    <span className="font-semibold">₪{calculatedCosts.distance_cost}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>{workerCount > 0 ? `${workerCount} ${workerCount === 1 ? 'עובד' : 'עובדים'} × ₪${calculatedCosts.food_cost_per_employee}` : 'עלות אוכל לכל עובד'}</span>
                  <span className="font-semibold">₪{calculatedCosts.food_cost}</span>
                </div>
                <div className="flex justify-between">
                  <span>עלות נסיעה</span>
                  <span className="font-semibold">₪{calculatedCosts.travel_cost}</span>
                </div>
                {Number(calculatedCosts.bonus_cost) > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span>+ תוספת תפקיד</span>
                    <span className="font-semibold">₪{calculatedCosts.bonus_cost}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-blue-200 pt-2 space-y-1">
                <div className="flex justify-between text-gray-900">
                  <span className="font-semibold">סה"כ ללא מע"מ</span>
                  <span className="font-bold text-lg">₪{calculatedCosts.final_cost}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span className="font-semibold">כולל מע"מ 17%</span>
                  <span className="font-extrabold text-xl">₪{calculatedCosts.final_cost_vat}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 pt-2">
            <button onClick={handleSaveReportEdits} disabled={saving} className="btn-primary mb-0">
              {saving ? '...' : '💾 שמור'}
            </button>
            <button onClick={handleSaveAndApprove} disabled={saving} className="btn-success mb-0">
              {saving ? '...' : '✓ אשר'}
            </button>
            <button onClick={handleRejectReport} disabled={saving} className="btn-danger mb-0">
              {saving ? '...' : '✕ דחה'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Manager;
