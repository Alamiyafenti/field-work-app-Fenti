import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Toast from '../components/Toast';
import { API_URL } from '../config/api';

const SERIAL_ID_REGEX = /^\d{5,10}$/;
const PHONE_REGEX = /^\d{7,15}$/;

/* ─── Shared input ─────────────────────────────────── */
function Field({ id, label, type = 'text', value, onChange, placeholder, inputMode }) {
  return (
    <div className="form-group mb-0">
      <label htmlFor={id} className="form-label">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        className="form-input"
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={type === 'password' ? 'current-password' : 'off'}
      />
    </div>
  );
}

/* ─── Card wrapper ──────────────────────────────────── */
function Card({ children }) {
  return (
    <div className="w-full max-w-md mx-auto mt-8 md:mt-16">
      <div className="rounded-3xl shadow-xl overflow-hidden border border-gray-100">
        {/* decorative header */}
        <div className="bg-gradient-to-l from-blue-600 to-indigo-600 px-8 py-8 text-white text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
            <span className="text-3xl">🏗️</span>
          </div>
          <h1 className="text-2xl font-extrabold">דוחות עבודת שטח</h1>
          <p className="text-blue-100 text-sm mt-1">מערכת ניהול עבודה בשטח</p>
        </div>
        <div className="bg-white px-8 py-8">{children}</div>
      </div>
    </div>
  );
}

function Login({ setCurrentUser, currentUser }) {
  const [setupRequired, setSetupRequired] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [managerName, setManagerName] = useState('');
  const [setupPhoneNumber, setSetupPhoneNumber] = useState('');
  const [serialId, setSerialId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const navigate = useNavigate();

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: 'info' });

  useEffect(() => {
    axios
      .get(`${API_URL}/setup/status`)
      .then((response) => {
        setSetupRequired(Boolean(response.data.setup_required));
      })
      .catch((error) => {
        console.error(error);
        showToast('בדיקת מצב התקנה נכשלה', 'error');
      })
      .finally(() => {
        setSetupLoading(false);
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!serialId.trim() || !password.trim()) {
      showToast('יש למלא תעודת זהות וסיסמה', 'error');
      return;
    }

    if (!SERIAL_ID_REGEX.test(serialId.trim())) {
      showToast('תעודת זהות חייבת להכיל 5 עד 10 ספרות', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        serial_id: serialId.trim(),
        password,
      });

      const user = {
        ...response.data.user,
        password,
      };

      localStorage.setItem('currentUser', JSON.stringify(user));
      setCurrentUser(user);
      showToast('התחברת בהצלחה', 'success');

      if (user.role === 'manager') {
        navigate('/manager');
      } else {
        navigate('/report');
      }
    } catch (error) {
      showToast('תעודת זהות או סיסמה שגויים', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirstManager = async (e) => {
    e.preventDefault();

    if (!managerName.trim() || !serialId.trim()) {
      showToast('יש למלא שם מנהל ותעודת זהות', 'error');
      return;
    }

    if (!SERIAL_ID_REGEX.test(serialId.trim())) {
      showToast('תעודת זהות חייבת להכיל 5 עד 10 ספרות', 'error');
      return;
    }

    if (setupPhoneNumber.trim() && !PHONE_REGEX.test(setupPhoneNumber.trim())) {
      showToast('מספר טלפון חייב להכיל 7 עד 15 ספרות', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/setup/manager`, {
        full_name: managerName.trim(),
        serial_id: serialId.trim(),
        phone_number: setupPhoneNumber.trim(),
      });

      const user = {
        id: response.data.user.id,
        serial_id: response.data.user.serial_id,
        role: response.data.user.role,
        full_name: response.data.user.full_name,
        phone_number: response.data.user.phone_number,
        password: response.data.user.password,
      };

      localStorage.setItem('currentUser', JSON.stringify(user));
      setCurrentUser(user);
      setSetupRequired(false);
      showToast('מנהל ראשי נוצר בהצלחה', 'success');
      navigate('/manager');
    } catch (error) {
      showToast('יצירת מנהל ראשי נכשלה', 'error');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
    showToast('התנתקת מהמערכת', 'info');
  };


  return (
    <>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      {setupLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="spinner" />
        </div>

      ) : setupRequired ? (
        <Card>
          <h2 className="text-xl font-extrabold text-gray-900 mb-1">הגדרה ראשונית</h2>
          <p className="text-sm text-gray-500 mb-6">
            לא נמצא מנהל במערכת. יצירת מנהל ראשי — תעודת הזהות תשמש גם כסיסמה.
          </p>
          <form onSubmit={handleCreateFirstManager} className="space-y-4">
            <Field id="setup-name"     label="שם מנהל"       value={managerName}       onChange={(e) => setManagerName(e.target.value)}                               placeholder="לדוגמה: ישראל ישראלי" />
            <Field id="setup-sid"      label="תעודת זהות"    value={serialId}          onChange={(e) => setSerialId(e.target.value.replace(/\D/g, ''))}              placeholder="5–10 ספרות" inputMode="numeric" />
            <Field id="setup-phone"    label="מספר טלפון"    value={setupPhoneNumber}  onChange={(e) => setSetupPhoneNumber(e.target.value.replace(/\D/g, ''))}      placeholder="לדוגמה: 0501234567" inputMode="numeric" />
            <button type="submit" className="btn-primary mt-2" disabled={loading}>
              {loading ? 'יוצר...' : '✓ צור מנהל ראשי'}
            </button>
          </form>
        </Card>

      ) : currentUser ? (
        <Card>
          <div className="text-center space-y-4">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-2xl font-black text-blue-600">
              {currentUser.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <div className="font-bold text-gray-900">{currentUser.full_name}</div>
              <div className="text-sm text-gray-500">{currentUser.role === 'manager' ? 'מנהל' : 'עובד'}</div>
            </div>
            <button type="button" onClick={handleLogout} className="btn-danger w-auto px-8">
              התנתקות
            </button>
          </div>
        </Card>

      ) : (
        <Card>
          <h2 className="text-xl font-extrabold text-gray-900 mb-1">כניסה למערכת</h2>
          <p className="text-sm text-gray-500 mb-6">הכנס תעודת זהות וסיסמה</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field id="login-serial-id" label="תעודת זהות" value={serialId} onChange={(e) => setSerialId(e.target.value.replace(/\D/g, ''))} placeholder="תעודת זהות" inputMode="numeric" />
            <Field id="login-password"  label="סיסמה"      type="password"  value={password}  onChange={(e) => setPassword(e.target.value)}  placeholder="סיסמה" />
            <button type="submit" className="btn-primary mt-2" disabled={loading}>
              {loading ? 'מתחבר...' : '→ כניסה'}
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

export default Login;
