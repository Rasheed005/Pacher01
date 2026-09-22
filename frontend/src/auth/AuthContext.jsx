import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/client.js';

// Holds the logged-in user and auth actions. On mount it asks the server who we
// are (GET /auth/me), so a page refresh keeps you logged in via the session cookie.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const { user } = await authApi.login(email, password);
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (payload) => {
    // Registration no longer opens a session — the student must verify their email
    // first. Return the server response ({ needsVerification, email }) unchanged.
    return authApi.register(payload);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Default landing route for each role.
export function dashboardPath(role) {
  return { student: '/student', supervisor: '/supervisor', admin: '/admin' }[role] || '/';
}
