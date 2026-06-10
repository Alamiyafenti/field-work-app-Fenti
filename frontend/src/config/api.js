const viteApiUrl = typeof import.meta !== 'undefined' ? import.meta.env.VITE_API_URL : '';

// Prefer explicit env value; otherwise use same-origin in production and localhost backend in local dev.
export const API_URL = viteApiUrl || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? ''
  : 'http://localhost:5000');
