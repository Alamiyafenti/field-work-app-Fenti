import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ReportForm from './pages/ReportForm';
import Manager from './pages/Manager';
import Reports from './pages/Reports';
import Employees from './pages/Employees';
import Login from './pages/Login';
import './index.css';

const NAV_LINK =
  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-150';
const NAV_ACTIVE = 'bg-blue-600 text-white shadow-sm';
const NAV_IDLE   = 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';

function NavLink({ to, label, icon, current }) {
  const active = current === to || (to !== '/' && current.startsWith(to));
  return (
    <Link to={to} className={`${NAV_LINK} ${active ? NAV_ACTIVE : NAV_IDLE}`}>
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
      try { setCurrentUser(JSON.parse(stored)); }
      catch { localStorage.removeItem('currentUser'); }
    }
  }, []);

  const isManager  = currentUser?.role === 'manager';
  const isEmployee = currentUser?.role === 'employee';

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setCurrentUser(null);
  };

  const roleLabel = isManager ? 'מנהל' : isEmployee ? 'עובד' : '';
  const roleColor = isManager ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';

  return (
    <div className="min-h-screen bg-[#f0f4fb]" dir="rtl" lang="he">

      {/* ── Top navigation ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">

          {/* Row 1 – brand + user */}
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-white text-sm font-black">FW</span>
              </div>
              <span className="text-lg font-extrabold text-gray-900 hidden sm:block">
                דוחות עבודת שטח
              </span>
            </div>

            {currentUser && (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-bold text-gray-900 leading-tight">{currentUser.full_name}</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`badge ${roleColor} text-[11px]`}>{roleLabel}</span>
                    {currentUser.phone_number && (
                      <span className="text-xs text-gray-400">{currentUser.phone_number}</span>
                    )}
                  </div>
                </div>

                {/* Avatar */}
                <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center text-white font-black text-sm shadow-sm">
                  {currentUser.full_name?.charAt(0) || '?'}
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-ghost btn-sm text-red-500 hover:bg-red-50 hover:text-red-600 border border-red-100 mb-0"
                >
                  יציאה
                </button>
              </div>
            )}
          </div>

          {/* Row 2 – nav links */}
          {currentUser && (
            <nav className="flex items-center gap-1 pb-2 overflow-x-auto">
              <NavLink to="/"         label="לוח בקרה" icon="🏠" current={location.pathname} />
              {(isEmployee || isManager) && (
                <NavLink to="/report" label="דוח חדש"   icon="📝" current={location.pathname} />
              )}
              {isManager && (
                <>
                  <NavLink to="/manager"   label="ניהול דוחות" icon="📋" current={location.pathname} />
                  <NavLink to="/reports"   label="לוח חודשי"   icon="📅" current={location.pathname} />
                  <NavLink to="/employees" label="עובדים"       icon="👷" current={location.pathname} />
                </>
              )}
            </nav>
          )}
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/"          element={currentUser ? <Dashboard /> : <Navigate to="/login" replace />} />
          <Route path="/login"     element={currentUser ? <Navigate to={isManager ? '/manager' : '/report'} replace /> : <Login setCurrentUser={setCurrentUser} currentUser={currentUser} />} />
          <Route path="/report"    element={(isEmployee || isManager) ? <ReportForm currentUser={currentUser} /> : <Navigate to="/login" replace />} />
          <Route path="/manager"   element={isManager  ? <Manager   currentUser={currentUser} /> : <Navigate to="/login" replace />} />
          <Route path="/reports"   element={isManager  ? <Reports   /> : <Navigate to="/login" replace />} />
          <Route path="/employees" element={isManager  ? <Employees /> : <Navigate to="/login" replace />} />
          <Route path="*"          element={<Navigate to={currentUser ? (isManager ? '/manager' : '/report') : '/login'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
