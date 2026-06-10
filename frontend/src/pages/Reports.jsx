import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import Toast from '../components/Toast';
import { API_URL } from '../config/api';

function Reports() {
  const getLocalMonthStr = () => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()).slice(0, 7);
  };

  const [selectedMonth, setSelectedMonth] = useState(getLocalMonthStr);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarDays, setCalendarDays] = useState([]);
  const [dayCounts, setDayCounts] = useState({});
  const [dayReports, setDayReports] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projectReportsData, setProjectReportsData] = useState(null);
  const [projectReportsLoading, setProjectReportsLoading] = useState(false);
  const [dayStatusFilter, setDayStatusFilter] = useState('all');
  const [daySearchTerm, setDaySearchTerm] = useState('');
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const [excludedReportIds, setExcludedReportIds] = useState(new Set());
  const [clientNote, setClientNote] = useState('');

  let currentUser = null;
  try {
    currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  } catch (error) {
    currentUser = null;
  }

  const authHeaders = useMemo(() => ({
    ...(currentUser?.serial_id && { 'x-user-serial-id': currentUser.serial_id }),
    ...(currentUser?.password && { 'x-user-password': currentUser.password }),
  }), [currentUser?.serial_id, currentUser?.password]);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: 'info' });

  const toggleExcludeReport = (id) => {
    setExcludedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  const generateCalendar = useCallback((monthStr) => {
    const [year, month] = monthStr.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i += 1) days.push(null);
    for (let i = 1; i <= daysInMonth; i += 1) {
      days.push(`${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }

    setCalendarDays(days);
  }, []);

  const fetchCalendarSummary = useCallback(async (month) => {
    try {
      const response = await axios.get(`${API_URL}/manager/calendar-summary`, {
        params: { month },
        headers: authHeaders,
      });

      const counts = {};
      (response.data.summary || []).forEach((item) => {
        counts[item.date] = item.report_count;
      });
      setDayCounts(counts);
    } catch (error) {
      console.error('Error fetching calendar summary:', error);
      setDayCounts({});
    }
  }, [authHeaders]);

  const fetchProjectsForMonth = useCallback(async (month) => {
    try {
      const response = await axios.get(`${API_URL}/manager/projects`, {
        params: { month },
        headers: authHeaders,
      });
      const list = response.data.projects || [];
      setProjects(list);
      if (selectedProject && !list.includes(selectedProject)) {
        setSelectedProject('');
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([]);
    }
  }, [authHeaders, selectedProject]);

  const fetchProjectReportsForExport = useCallback(async (project, month) => {
    if (!project || !month) {
      setProjectReportsData(null);
      return;
    }

    setProjectReportsLoading(true);
    try {
      const response = await axios.get(`${API_URL}/manager/project-reports`, {
        params: { project, month },
        headers: authHeaders,
      });
      setProjectReportsData(response.data);
    } catch (error) {
      setProjectReportsData(null);
      showToast('טעינת דוחות הפרויקט נכשלה', 'error');
      console.error(error);
    } finally {
      setProjectReportsLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    generateCalendar(selectedMonth);
    fetchCalendarSummary(selectedMonth);
    fetchProjectsForMonth(selectedMonth);
  }, [selectedMonth, generateCalendar, fetchCalendarSummary, fetchProjectsForMonth]);

  useEffect(() => {
    fetchProjectReportsForExport(selectedProject, selectedMonth);
    setExcludedReportIds(new Set());
  }, [selectedProject, selectedMonth, fetchProjectReportsForExport]);

  const handleDayClick = async (date) => {
    if (!date) return;

    setSelectedDate(date);
    setLoading(true);

    try {
      const response = await axios.get(`${API_URL}/manager/reports-by-date`, {
        params: { date },
        headers: authHeaders,
      });

      setDayReports(response.data);
      setDaySearchTerm('');
      setDayStatusFilter('all');
    } catch (error) {
      showToast('טעינת דוחות לתאריך זה נכשלה', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!selectedProject || !selectedMonth) {
      showToast('יש לבחור פרויקט וחודש', 'error');
      return;
    }

    setExporting(true);
    try {
      const exportParams = { project: selectedProject, month: selectedMonth };
      if (excludedReportIds.size > 0) {
        exportParams.exclude_ids = [...excludedReportIds].join(',');
      }
      if (clientNote.trim()) {
        exportParams.client_note = clientNote.trim();
      }

      const response = await axios.get(`${API_URL}/manager/export`, {
        params: exportParams,
        headers: authHeaders,
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedProject}_${selectedMonth}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast('קובץ אקסל הורד בהצלחה', 'success');
    } catch (error) {
      showToast('ייצוא לאקסל נכשל. ודא שיש דוחות עבור הפרויקט והחודש שנבחרו.', 'error');
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  const getDayReportCount = (date) => dayCounts[date] || 0;

  const monthName = new Date(`${selectedMonth}-01`).toLocaleDateString('he-IL', {
    month: 'long',
    year: 'numeric',
  });

  const dayNames = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  const statusLabel = (status) => {
    if (status === 'pending') return 'בהמתנה';
    if (status === 'approved') return 'מאושר';
    if (status === 'rejected') return 'נדחה';
    return status;
  };

  const normalizeText = (value) => String(value || '').toLowerCase();

  const filteredDayReports = (dayReports?.reports || []).filter((report) => {
    if (dayStatusFilter !== 'all' && report.status !== dayStatusFilter) {
      return false;
    }

    const search = normalizeText(daySearchTerm.trim());
    if (!search) return true;

    const haystack = [report.project_name, report.client, report.location, report.day]
      .map(normalizeText)
      .join(' ');
    return haystack.includes(search);
  });

  return (
    <div className="page-shell">
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className="page-header">
        <h1 className="page-title">לוח דוחות</h1>
        <p className="page-subtitle">צפייה ביומן דוחות וייצוא חודשי לאקסל</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="page-section">
            <div className="flex justify-between items-center mb-4">
              <h2 className="card-title mb-0">יומן חודשי</h2>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="form-input w-auto"
              />
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-center font-semibold mb-4">{monthName}</h3>

              <div className="grid grid-cols-7 gap-2 mb-2">
                {dayNames.map((day) => (
                  <div key={day} className="text-center font-semibold text-sm text-gray-600">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((date, idx) => {
                  const count = date ? getDayReportCount(date) : 0;
                  const isSelected = date === selectedDate;
                  return (
                    <div
                      key={`${date || 'empty'}-${idx}`}
                      onClick={() => date && handleDayClick(date)}
                      className={[
                        'relative flex flex-col items-center justify-center rounded-xl text-sm font-semibold transition-all select-none',
                        'min-h-[3rem] cursor-pointer',
                        !date ? 'text-gray-200 cursor-default' : '',
                        isSelected ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-300' : '',
                        date && !isSelected ? 'bg-white border border-gray-200 text-gray-800 hover:border-blue-300 hover:shadow-sm hover:bg-blue-50' : '',
                      ].join(' ')}
                    >
                      {date ? new Date(`${date}T12:00:00`).getDate() : ''}
                      {count > 0 && (
                        <span className={`mt-0.5 text-xs font-bold leading-none ${isSelected ? 'text-blue-200' : 'text-blue-600'}`}>
                          {count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {selectedDate && (
            <div className="page-section">
              <h2 className="card-title">דוחות לתאריך {new Date(selectedDate).toLocaleDateString('he-IL')}</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <div className="form-group mb-0">
                  <label htmlFor="day-status-filter" className="form-label">סטטוס</label>
                  <select
                    id="day-status-filter"
                    value={dayStatusFilter}
                    onChange={(e) => setDayStatusFilter(e.target.value)}
                    className="form-input"
                  >
                    <option value="all">הכל</option>
                    <option value="pending">בהמתנה</option>
                    <option value="approved">מאושר</option>
                    <option value="rejected">נדחה</option>
                  </select>
                </div>

                <div className="form-group mb-0 md:col-span-2">
                  <label htmlFor="day-search" className="form-label">חיפוש</label>
                  <input
                    id="day-search"
                    type="text"
                    value={daySearchTerm}
                    onChange={(e) => setDaySearchTerm(e.target.value)}
                    className="form-input"
                    placeholder="חיפוש לפי פרויקט, לקוח, יום או מיקום"
                  />
                </div>
              </div>

              {loading ? (
                <div className="text-center py-4">טוען...</div>
              ) : dayReports?.reports?.length > 0 ? (
                <div className="space-y-3">
                  {filteredDayReports.length > 0 ? filteredDayReports.map((report) => (
                    <div key={report.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <span className="font-extrabold text-gray-900">{report.project_name}</span>
                          <span className="text-gray-400 mx-2">·</span>
                          <span className="text-sm text-gray-500">{report.client}</span>
                        </div>
                        <span className={`badge badge-${report.status}`}>{statusLabel(report.status)}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>👷 {report.worker_count} עובדים</span>
                        <span dir="ltr">⏰ {report.start_time}–{report.end_time}</span>
                        <span>📍 {report.location}</span>
                      </div>
                    </div>
                  )) : <div className="rounded-xl bg-gray-50 border border-gray-100 p-6 text-center text-sm text-gray-500">לא נמצאו תוצאות לסינון</div>}

                  {dayReports.summary && (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
                        <div className="text-xs text-gray-500 font-medium">דוחות</div>
                        <div className="text-2xl font-extrabold text-blue-700">{dayReports.summary.total_reports}</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                        <div className="text-xs text-gray-500 font-medium">עובדים</div>
                        <div className="text-2xl font-extrabold text-emerald-700">{dayReports.summary.total_workers}</div>
                      </div>
                      <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
                        <div className="text-xs text-gray-500 font-medium">שעות</div>
                        <div className="text-2xl font-extrabold text-violet-700">{dayReports.summary.total_hours}</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-600 py-4">אין דוחות לתאריך זה</p>
              )}
            </div>
          )}
        </div>

        <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 h-fit">
          <h2 className="card-title">ייצוא אקסל ללקוח</h2>
          <div className="space-y-4">
            <div className="form-group">
              <label htmlFor="project-select" className="form-label">פרויקט</label>
              <select
                id="project-select"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="form-input"
              >
                <option value="">בחר פרויקט</option>
                {projects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="month-select" className="form-label">חודש</label>
              <input
                id="month-select"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="client-note" className="form-label">הערות ללקוח (יופיע באקסל)</label>
              <textarea
                id="client-note"
                value={clientNote}
                onChange={(e) => setClientNote(e.target.value)}
                className="form-input resize-none text-sm"
                rows={3}
                placeholder="לדוגמא: עבודות שבוצעו בחודש מאי 2026..."
                maxLength={1000}
              />
            </div>

            <button onClick={handleExport} disabled={exporting || !selectedProject} className="btn-primary">
              {exporting ? 'מייצא...' : 'הורדת אקסל'}
            </button>

                {selectedProject && (
              <div className="bg-white p-3 rounded text-sm text-gray-700 border border-blue-200">
                <p className="text-sm font-semibold mb-1">תצוגה מקדימית — לחץ ✓/✕ לכלול/להוציא מהאקסל</p>

                {projectReportsLoading ? (
                  <p className="text-xs text-gray-500">טוען דוחות פרויקט...</p>
                ) : projectReportsData?.reports?.length > 0 ? (
                  <>
                    <div className="mb-2 text-xs text-gray-600 flex items-center justify-between">
                      <span>סה"כ {projectReportsData.summary.total_reports} דוחות · {projectReportsData.summary.total_hours} שעות</span>
                      {excludedReportIds.size > 0 && (
                        <span className="text-red-600 font-bold">{excludedReportIds.size} מוסננים</span>
                      )}
                    </div>
                    <div className="max-h-56 overflow-auto border border-gray-100 rounded">
                      {projectReportsData.reports.map((report) => {
                        const isExcluded = excludedReportIds.has(report.id);
                        return (
                          <div key={report.id} className={`flex items-center gap-1.5 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 transition-opacity ${isExcluded ? 'opacity-40' : ''}`}>
                            <button
                              type="button"
                              onClick={() => toggleExcludeReport(report.id)}
                              title={isExcluded ? 'לחץ לכלול בייצוא' : 'לחץ להסיר מייצוא'}
                              className={`flex-shrink-0 w-5 h-5 rounded text-[10px] font-extrabold flex items-center justify-center border transition-colors ${isExcluded ? 'bg-red-100 text-red-600 border-red-300' : 'bg-emerald-100 text-emerald-700 border-emerald-300'}`}
                            >
                              {isExcluded ? '✕' : '✓'}
                            </button>
                            <div className={`flex-1 grid grid-cols-3 gap-1 ${isExcluded ? 'line-through' : ''}`}>
                              <div>{report.date}</div>
                              <div dir="ltr">{report.start_time}–{report.end_time}</div>
                              <div className={report.status === 'approved' ? 'text-emerald-700 font-semibold' : 'text-amber-600'}>
                                {report.status === 'approved' ? 'מאושר' : report.status === 'rejected' ? 'נדחה' : 'בהמתנה'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {excludedReportIds.size > 0 && (
                      <button type="button" onClick={() => setExcludedReportIds(new Set())} className="btn-ghost btn-sm mt-2 mb-0 text-xs w-full">
                        אפס סינון — כלול הכל
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-500">אין דוחות לפרויקט זה בחודש שנבחר.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;
