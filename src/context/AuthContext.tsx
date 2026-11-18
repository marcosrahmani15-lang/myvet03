import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ClinicSession } from '../types';
import { api, ApiError } from '../services/apiClient';

interface AuthContextValue {
  session: ClinicSession;
  loading: boolean;
  error: string | null;
  refreshSession: () => Promise<void>;
  switchClinic: (clinicId: string) => Promise<void>;
}

const EMPTY_SESSION: ClinicSession = {
  authenticated: false,
  isDevAutoLogin: false,
  user: null,
  activeClinic: null,
  activeRole: null,
  memberships: [],
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<ClinicSession>(EMPTY_SESSION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ClinicSession>('/api/auth/session');
      setSession(data);
    } catch (err: any) {
      setSession(EMPTY_SESSION);
      setError(err instanceof ApiError ? err.message : 'Impossible de charger la session clinique.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const switchClinic = async (clinicId: string) => {
    const data = await api.post<ClinicSession>('/api/auth/switch-clinic', { clinicId });
    setSession(data);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        refreshSession,
        switchClinic,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
