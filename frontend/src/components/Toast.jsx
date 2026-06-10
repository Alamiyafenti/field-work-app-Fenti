import React, { useEffect } from 'react';

const STYLES = {
  success: { wrap: 'bg-emerald-600 text-white border-emerald-700', icon: '✓' },
  error:   { wrap: 'bg-red-600   text-white border-red-700',     icon: '✕' },
  info:    { wrap: 'bg-blue-600  text-white border-blue-700',    icon: 'ℹ️' },
};

function Toast({ message, type = 'info', onClose, duration = 3500 }) {
  useEffect(() => {
    if (!message) return undefined;
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [message, duration, onClose]);

  if (!message) return null;

  const s = STYLES[type] || STYLES.info;

  return (
    <div className={`toast-enter fixed bottom-5 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm`}>
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl ${s.wrap}`}>
        <span className="text-lg leading-none">{s.icon}</span>
        <span className="flex-1 text-sm font-bold leading-snug">{message}</span>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-black opacity-70 hover:opacity-100 hover:bg-white/20 transition-opacity"
        >
          סגור
        </button>
      </div>
    </div>
  );
}

export default Toast;
