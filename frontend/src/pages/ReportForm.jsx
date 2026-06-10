import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Toast from '../components/Toast';
import { API_URL } from '../config/api';

const PROJECT_CLIENT_STORAGE_KEY = 'managedProjectClients';
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const minuteOptions = Array.from({ length: 12 }, (_, idx) => String(idx * 5).padStart(2, '0'));
const workerCountOptions = Array.from({ length: 50 }, (_, idx) => idx + 1);

const shiftPresets = [
  { label: '07:00 - 15:00', start: '07:00', end: '15:00' },
  { label: '08:00 - 16:00', start: '08:00', end: '16:00' },
  { label: '09:00 - 17:00', start: '09:00', end: '17:00' },
  { label: '16:00 - 00:00', start: '16:00', end: '00:00' },
];

function buildTimeValue(hour, minute) {
  if (!hour || !minute) return '';
  return `${hour}:${minute}`;
}

function normalizeTimeValue(timeValue) {
  if (!timeValue || !timeValue.includes(':')) return '';
  const [rawHour, rawMinute] = timeValue.split(':');
  const hour = String(rawHour).padStart(2, '0');
  const minute = String(rawMinute).padStart(2, '0');
  return `${hour}:${minute}`;
}

function splitTimeValue(timeValue) {
  const normalized = normalizeTimeValue(timeValue);
  if (!normalized) return { hour: '', minute: '' };
  const [hour, minute] = normalized.split(':');
  return { hour, minute };
}

function buildLegacyTimeValue(draft, hourKey, minuteKey, timeKey) {
  if (draft?.[timeKey]) return normalizeTimeValue(draft[timeKey]);
  return buildTimeValue(draft?.[hourKey], draft?.[minuteKey]);
}

function getDraftTimeParts(draft, hourKey, minuteKey, timeKey) {
  const legacyHour = draft?.[hourKey] || '';
  const legacyMinute = draft?.[minuteKey] || '';
  if (legacyHour && legacyMinute) {
    return { hour: legacyHour, minute: legacyMinute };
  }
  return splitTimeValue(draft?.[timeKey] || '');
}

function calculateWorkDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;

  const [startHour, startMinute] = startTime.split(':').map((value) => parseInt(value, 10));
  const [endHour, endMinute] = endTime.split(':').map((value) => parseInt(value, 10));

  if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) {
    return null;
  }

  const startTotal = (startHour * 60) + startMinute;
  const endTotal = (endHour * 60) + endMinute;
  let diff = endTotal - startTotal;

  let isOvernight = false;
  if (diff <= 0) {
    diff += 24 * 60;
    isOvernight = true;
  }

  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;

  return {
    hours,
    minutes,
    formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
    label: `${hours} שעות ו-${minutes} דקות`,
    isOvernight,
  };
}

function ReportForm({ currentUser }) {
  const [employeeOptions, setEmployeeOptions] = useState([]);

  const buildDraftPayload = useCallback((data) => ({
    ...data,
    _savedAt: new Date().toISOString(),
  }), []);

  const getLocalDateStr = () => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  };

  const [formData, setFormData] = useState({
    project_name: '',
    client: '',
    date: getLocalDateStr(),
    location: '',
    start_hour: '',
    start_minute: '',
    end_hour: '',
    end_minute: '',
    start_time: '',
    end_time: '',
    worker_count: 1,
    workers: [{ id: '', name: '' }],
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [localDrafts, setLocalDrafts] = useState([]);
  const [projectClientCatalog, setProjectClientCatalog] = useState([]);
  const [toast, setToast] = useState({ message: '', type: 'info' });

  const startTimeValue = buildTimeValue(formData.start_hour, formData.start_minute) || normalizeTimeValue(formData.start_time);
  const endTimeValue = buildTimeValue(formData.end_hour, formData.end_minute) || normalizeTimeValue(formData.end_time);
  const workDuration = calculateWorkDuration(startTimeValue, endTimeValue);

  const startTimeParts = { hour: formData.start_hour, minute: formData.start_minute };
  const endTimeParts = { hour: formData.end_hour, minute: formData.end_minute };

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: 'info' });

  const hasMeaningfulDraft = useCallback((draft) => {
    if (!draft) return false;

    const workerNames = Array.isArray(draft.workers)
      ? draft.workers.map((worker) => (typeof worker === 'string' ? worker : worker?.name || ''))
      : [];

    return Boolean(
      (draft.project_name || '').trim() ||
      (draft.client || '').trim() ||
      (draft.location || '').trim() ||
      (draft.start_time || '').trim() ||
      (draft.end_time || '').trim() ||
      workerNames.some((name) => (name || '').trim())
    );
  }, []);

  const isValidCurrentDraft = useCallback((draft) => {
    if (!draft || !draft._savedAt) return false;

    const savedAtMillis = Date.parse(draft._savedAt);
    if (Number.isNaN(savedAtMillis)) return false;

    return hasMeaningfulDraft(draft);
  }, [hasMeaningfulDraft]);

  useEffect(() => {
    const drafts = JSON.parse(localStorage.getItem('reportDrafts') || '[]');
    setLocalDrafts(drafts);

    const savedCatalog = JSON.parse(localStorage.getItem(PROJECT_CLIENT_STORAGE_KEY) || '[]');
    setProjectClientCatalog(Array.isArray(savedCatalog) ? savedCatalog : []);

    const savedCurrentDraft = JSON.parse(localStorage.getItem('currentDraft') || 'null');
    if (!isValidCurrentDraft(savedCurrentDraft)) {
      localStorage.removeItem('currentDraft');
    }
  }, [isValidCurrentDraft]);

  const projectOptions = Array.from(new Set(projectClientCatalog.map((entry) => entry.project_name)));

  useEffect(() => {
    if (!currentUser?.serial_id || !currentUser?.password) return;

    axios
      .get(`${API_URL}/employees`, {
        headers: {
          'x-user-serial-id': currentUser.serial_id,
          'x-user-password': currentUser.password,
        },
      })
      .then((response) => {
        setEmployeeOptions(response.data.employees || []);
      })
      .catch((error) => {
        console.error('Employees load error:', error);
      });
  }, [currentUser]);

  const clientOptions = projectClientCatalog
    .filter((entry) => entry.project_name === formData.project_name)
    .map((entry) => entry.client);

  const hasCatalog = projectOptions.length > 0;

  useEffect(() => {
    if (hasMeaningfulDraft(formData)) {
      const payload = buildDraftPayload(formData);
      localStorage.setItem('currentDraft', JSON.stringify(payload));
    }
  }, [formData, hasMeaningfulDraft, buildDraftPayload]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.project_name.trim()) {
      newErrors.project_name = 'יש לבחור שם פרויקט';
    }
    if (!formData.client.trim()) {
      newErrors.client = 'יש לבחור שם לקוח';
    }
    if (!formData.date) {
      newErrors.date = 'יש לבחור תאריך';
    }
    if (!formData.location.trim()) {
      newErrors.location = 'יש למלא מיקום';
    }
    if (!startTimeValue) {
      newErrors.start_time = 'יש לבחור שעת התחלה';
    }
    if (!endTimeValue) {
      newErrors.end_time = 'יש לבחור שעת סיום';
    }
    if (startTimeValue && endTimeValue && startTimeValue === endTimeValue) {
      newErrors.end_time = 'שעת סיום לא יכולה להיות זהה לשעת התחלה';
    }
    if (formData.worker_count < 1) {
      newErrors.worker_count = 'מספר העובדים חייב להיות לפחות 1';
    }

    const selectedWorkerIds = formData.workers.filter((worker) => worker.id).map((worker) => String(worker.id));
    if (selectedWorkerIds.length !== Number(formData.worker_count)) {
      newErrors.workers = 'יש לבחור שם לכל עובד';
    }

    const uniqueWorkerIds = new Set(selectedWorkerIds);
    if (uniqueWorkerIds.size !== selectedWorkerIds.length) {
      newErrors.workers = 'לא ניתן לבחור את אותו עובד פעמיים';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'worker_count') {
      const count = Math.max(1, parseInt(value || '1', 10));
      setFormData((prev) => {
        const currentWorkers = prev.workers || [];
        const resizedWorkers = Array.from({ length: count }, (_, idx) => currentWorkers[idx] || { id: '', name: '' });
        return {
          ...prev,
          worker_count: count,
          workers: resizedWorkers,
        };
      });
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleWorkerNameChange = (index, employeeId) => {
    const employee = employeeOptions.find((item) => String(item.id) === String(employeeId));
    let hasDuplicates = false;

    setFormData((prev) => {
      const selectedByOthers = prev.workers
        .filter((_, workerIndex) => workerIndex !== index)
        .map((worker) => String(worker.id))
        .filter(Boolean);

      if (employeeId && selectedByOthers.includes(String(employeeId))) {
        return prev;
      }

      const nextWorkers = [...prev.workers];
      nextWorkers[index] = {
        id: employee ? employee.id : '',
        name: employee ? employee.full_name : '',
      };

      const normalizedIds = nextWorkers.map((worker) => String(worker.id)).filter(Boolean);
      hasDuplicates = new Set(normalizedIds).size !== normalizedIds.length;

      return { ...prev, workers: nextWorkers };
    });

    setErrors((prevErrors) => {
      if (hasDuplicates) {
        return { ...prevErrors, workers: 'לא ניתן לבחור את אותו עובד פעמיים' };
      }

      if (prevErrors.workers === 'לא ניתן לבחור את אותו עובד פעמיים') {
        const { workers, ...rest } = prevErrors;
        return rest;
      }

      return prevErrors;
    });
  };

  const handleTimePartChange = (fieldName, partName, value) => {
    const isStartField = fieldName === 'start_time';
    const hourKey = isStartField ? 'start_hour' : 'end_hour';
    const minuteKey = isStartField ? 'start_minute' : 'end_minute';

    setFormData((prev) => ({
      ...prev,
      [hourKey]: partName === 'hour' ? value : prev[hourKey],
      [minuteKey]: partName === 'minute' ? value : prev[minuteKey],
      [fieldName]: buildTimeValue(
        partName === 'hour' ? value : prev[hourKey],
        partName === 'minute' ? value : prev[minuteKey]
      ),
    }));
  };

  const applyShiftPreset = (start, end) => {
    const startParts = splitTimeValue(start);
    const endParts = splitTimeValue(end);

    setFormData((prev) => ({
      ...prev,
      start_hour: startParts.hour,
      start_minute: startParts.minute,
      end_hour: endParts.hour,
      end_minute: endParts.minute,
      start_time: start,
      end_time: end,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSubmitting(true);

    try {
      const workersList = formData.workers.map((worker) => worker.name).filter((name) => name);
      const workerIds = formData.workers.map((worker) => Number(worker.id)).filter((id) => Number.isInteger(id));

      await axios.post(
        `${API_URL}/reports`,
        {
          project_name: formData.project_name,
          client: formData.client,
          date: formData.date,
          location: formData.location,
          start_time: startTimeValue,
          end_time: endTimeValue,
          worker_count: parseInt(formData.worker_count, 10),
          workers: workersList,
          worker_ids: workerIds,
        },
        {
          headers: {
            'x-user-serial-id': currentUser.serial_id,
            'x-user-password': currentUser.password,
          },
        }
      );

      localStorage.removeItem('currentDraft');

      setFormData({
        project_name: '',
        client: '',
        date: getLocalDateStr(),
        location: '',
        start_hour: '',
        start_minute: '',
        end_hour: '',
        end_minute: '',
        start_time: '',
        end_time: '',
        worker_count: 1,
        workers: [{ id: '', name: '' }],
      });

      setSubmitSuccess(true);
      showToast('הדוח נשלח בהצלחה', 'success');
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (error) {
      const currentDraft = JSON.parse(localStorage.getItem('currentDraft') || '{}');
      const drafts = [...localDrafts, { ...currentDraft, timestamp: new Date().toISOString() }];
      const latestDrafts = drafts.slice(-10);
      localStorage.setItem('reportDrafts', JSON.stringify(latestDrafts));
      setLocalDrafts(latestDrafts);

      showToast('הדוח נשמר מקומית. ניתן לנסות שוב או להמשיך מאוחר יותר.', 'info');
      console.error('Submission error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadDraft = (draft) => {
    const workerCount = Number(draft.worker_count) > 0 ? Number(draft.worker_count) : 1;
    let workers = [''];

    if (Array.isArray(draft.workers)) {
      workers = draft.workers.map((worker) => {
        if (typeof worker === 'string') return { id: '', name: worker };
        return worker;
      });
    } else if (typeof draft.workers === 'string') {
      workers = draft.workers.split(',').map((name) => ({ id: '', name: name.trim() }));
    }

    workers = Array.from({ length: workerCount }, (_, idx) => workers[idx] || { id: '', name: '' });

    const startParts = getDraftTimeParts(draft, 'start_hour', 'start_minute', 'start_time');
    const endParts = getDraftTimeParts(draft, 'end_hour', 'end_minute', 'end_time');

    setFormData({
      project_name: draft.project_name || '',
      client: draft.client || '',
      date: draft.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()),
      location: draft.location || '',
      start_hour: startParts.hour,
      start_minute: startParts.minute,
      end_hour: endParts.hour,
      end_minute: endParts.minute,
      start_time: buildLegacyTimeValue(draft, 'start_hour', 'start_minute', 'start_time'),
      end_time: buildLegacyTimeValue(draft, 'end_hour', 'end_minute', 'end_time'),
      worker_count: workerCount,
      workers,
    });
  };

  const handleClearForm = () => {
    setFormData({
      project_name: '',
      client: '',
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()),
      location: '',
      start_hour: '',
      start_minute: '',
      end_hour: '',
      end_minute: '',
      start_time: '',
      end_time: '',
      worker_count: 1,
      workers: [{ id: '', name: '' }],
    });
    localStorage.removeItem('currentDraft');
    showToast('הטופס נוקה', 'info');
  };

  return (
    <div className="page-shell">
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className="page-header">
        <h1 className="page-title">דוח עבודת שטח חדש</h1>
        <p className="page-subtitle">שליחת דוח עבודה יומי</p>
      </div>

      {submitSuccess && (
        <div className="rounded-2xl bg-emerald-500 text-white px-5 py-4 flex items-center gap-3 shadow-sm">
          <span className="text-2xl">✅</span>
          <div>
            <div className="font-bold">הדוח נשלח בהצלחה!</div>
            <div className="text-sm text-emerald-100">הדוח נמצא עכשיו באזור המנהל לאישור</div>
          </div>
        </div>
      )}

      {localDrafts.length > 0 && (
        <div className="page-section bg-blue-50 border-blue-200">
          <h3 className="font-semibold mb-3 text-blue-900">טיוטות שמורות</h3>
          <div className="space-y-2">
            {localDrafts.map((draft, idx) => (
              <div
                key={`${draft.timestamp || 'draft'}-${idx}`}
                className="flex justify-between items-center bg-white p-3 rounded border border-blue-200"
              >
                <span className="text-sm">
                  {draft.project_name || 'טיוטה ללא פרויקט'} - {draft.timestamp ? new Date(draft.timestamp).toLocaleString('he-IL') : ''}
                </span>
                <button
                  type="button"
                  onClick={() => handleLoadDraft(draft)}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                  טען
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" autoComplete="off">
        <div className="space-y-4">
          {!hasCatalog && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              ⚠️ לפני שליחת דוח יש להיכנס לאזור מנהל ולהוסיף פרויקט ולקוח.
            </div>
          )}

          <div className="form-group">
            <label htmlFor="project_name" className="form-label">שם פרויקט *</label>
            <select
              id="project_name"
              name="project_name"
              value={formData.project_name}
              onChange={(e) => {
                const selectedProject = e.target.value;
                setFormData((prev) => ({ ...prev, project_name: selectedProject, client: '' }));
              }}
              className="form-input"
              autoComplete="off"
            >
              <option value="">בחר פרויקט</option>
              {projectOptions.map((project) => (
                <option key={project} value={project}>{project}</option>
              ))}
              {formData.project_name && !projectOptions.includes(formData.project_name) && (
                <option value={formData.project_name}>{formData.project_name} (לא מרשימת המנהל)</option>
              )}
            </select>
            {errors.project_name && <div className="form-error">{errors.project_name}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="client" className="form-label">לקוח *</label>
            <select
              id="client"
              name="client"
              value={formData.client}
              onChange={(e) => setFormData((prev) => ({ ...prev, client: e.target.value }))}
              className="form-input"
              autoComplete="off"
              disabled={!formData.project_name}
            >
              <option value="">{formData.project_name ? 'בחר לקוח' : 'בחר קודם פרויקט'}</option>
              {clientOptions.map((client) => (
                <option key={`${formData.project_name}-${client}`} value={client}>{client}</option>
              ))}
              {formData.client && !clientOptions.includes(formData.client) && (
                <option value={formData.client}>{formData.client} (לא מרשימת המנהל)</option>
              )}
            </select>
            {errors.client && <div className="form-error">{errors.client}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="date" className="form-label">תאריך *</label>
            <input
              type="date"
              id="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="form-input"
            />
            {errors.date && <div className="form-error">{errors.date}</div>}
          </div>

          <div className="form-group">
            <label htmlFor="location" className="form-label">מיקום *</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="form-input"
              placeholder="מיקום העבודה"
            />
            {errors.location && <div className="form-error">{errors.location}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">בחירה מהירה של משמרת</label>
            <div className="flex flex-wrap gap-2" dir="ltr">
              {shiftPresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyShiftPreset(preset.start, preset.end)}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-100 hover:border-blue-400 active:scale-95"
                  dir="ltr"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">שעת התחלה *</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={startTimeParts.hour}
                  onChange={(e) => handleTimePartChange('start_time', 'hour', e.target.value)}
                  className="form-input"
                  dir="ltr"
                >
                  <option value="">שעה</option>
                  {hourOptions.map((hour) => (
                    <option key={`start-hour-${hour}`} value={hour}>{hour}</option>
                  ))}
                </select>
                <select
                  value={startTimeParts.minute}
                  onChange={(e) => handleTimePartChange('start_time', 'minute', e.target.value)}
                  className="form-input"
                  dir="ltr"
                >
                  <option value="">דקה</option>
                  {minuteOptions.map((minute) => (
                    <option key={`start-minute-${minute}`} value={minute}>{minute}</option>
                  ))}
                </select>
              </div>
              {startTimeValue && <div className="form-help">שעת התחלה שנבחרה: {startTimeValue}</div>}
              <div className="form-help">טווח אפשרי: שעות 00-23 ודקות בקפיצות של 5</div>
              {errors.start_time && <div className="form-error">{errors.start_time}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">שעת סיום *</label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={endTimeParts.hour}
                  onChange={(e) => handleTimePartChange('end_time', 'hour', e.target.value)}
                  className="form-input"
                  dir="ltr"
                >
                  <option value="">שעה</option>
                  {hourOptions.map((hour) => (
                    <option key={`end-hour-${hour}`} value={hour}>{hour}</option>
                  ))}
                </select>
                <select
                  value={endTimeParts.minute}
                  onChange={(e) => handleTimePartChange('end_time', 'minute', e.target.value)}
                  className="form-input"
                  dir="ltr"
                >
                  <option value="">דקה</option>
                  {minuteOptions.map((minute) => (
                    <option key={`end-minute-${minute}`} value={minute}>{minute}</option>
                  ))}
                </select>
              </div>
              {endTimeValue && <div className="form-help">שעת סיום שנבחרה: {endTimeValue}</div>}
              <div className="form-help">טווח אפשרי: שעות 00-23 ודקות בקפיצות של 5</div>
              {errors.end_time && <div className="form-error">{errors.end_time}</div>}
            </div>
          </div>

          {(startTimeValue || endTimeValue) && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3">
              <div className="flex items-center gap-6 flex-wrap text-sm" dir="ltr">
                <div dir="ltr">
                  <span className="text-gray-500 text-xs">התחלה</span>
                  <div className="font-extrabold text-blue-700 text-lg">{startTimeValue || '--:--'}</div>
                </div>
                <div className="text-gray-300 text-xl">→</div>
                <div dir="ltr">
                  <span className="text-gray-500 text-xs">סיום</span>
                  <div className="font-extrabold text-blue-700 text-lg">{endTimeValue || '--:--'}</div>
                </div>
                {workDuration && (
                  <>
                    <div className="text-gray-300 text-xl">=</div>
                    <div>
                      <span className="text-gray-500 text-xs">משך</span>
                      <div className="font-extrabold text-emerald-700 text-lg" dir="ltr">{workDuration.formatted}</div>
                      {workDuration.isOvernight && <div className="text-xs text-indigo-600">משמרת לילה</div>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {startTimeValue && endTimeValue && endTimeValue < startTimeValue && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-800">
              משמרת לילה מזוהה: שעת הסיום תיחשב ליום הבא.
            </div>
          )}

          <div className="form-group">
            <label htmlFor="worker_count" className="form-label">מספר עובדים *</label>
            <select
              id="worker_count"
              name="worker_count"
              value={formData.worker_count}
              onChange={handleChange}
              className="form-input"
              dir="ltr"
            >
              {workerCountOptions.map((count) => (
                <option key={`worker-count-${count}`} value={count}>{count}</option>
              ))}
            </select>
            {errors.worker_count && <div className="form-error">{errors.worker_count}</div>}
          </div>

          <div className="form-group">
            <label className="form-label">שמות עובדים *</label>
            <div className="space-y-2">
              {formData.workers.map((worker, index) => (
                <select
                  key={`worker-${index}`}
                  value={worker.id}
                  onChange={(e) => handleWorkerNameChange(index, e.target.value)}
                  className="form-input"
                >
                  <option value="">בחר עובד {index + 1}</option>
                  {employeeOptions.map((employee) => {
                    const selectedByAnother = formData.workers.some(
                      (selectedWorker, selectedIndex) =>
                        selectedIndex !== index && String(selectedWorker.id) === String(employee.id)
                    );

                    return (
                      <option
                        key={`worker-option-${employee.id}`}
                        value={employee.id}
                        disabled={selectedByAnother}
                      >
                        {employee.full_name}
                      </option>
                    );
                  })}
                </select>
              ))}
            </div>
            {errors.workers && <div className="form-error">{errors.workers}</div>}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button type="submit" className="btn-primary mb-0" disabled={submitting || !hasCatalog}>
              {submitting ? 'שולח...' : 'שלח דוח →'}
            </button>
            <button type="button" onClick={handleClearForm} className="btn-ghost mb-0">
              נקה טופס
            </button>
          </div>
        </div>
      </form>

      <div className="rounded-2xl bg-gray-100 border border-gray-200 px-5 py-4">
        <h3 className="font-bold text-gray-700 mb-1 text-sm">👋 דוחות עובדים גם כשאין קליטה</h3>
        <p className="text-sm text-gray-600">
          במקרה של ניתוק מהאינטרנט, הטופס נשמר אוטומטית כטיוטה ותוכל לטעון ולשלוח אותו מאוחר יותר.
        </p>
      </div>
    </div>
  );
}

export default ReportForm;
