import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Appointment,
  CashClosingSummary,
  Client,
  HospitalizationBox,
  Invoice,
  Patient,
  ReportsOverview,
  StockItem,
  Task,
  VaccinationRecord,
} from '../types';
import { api, ApiError } from '../services/apiClient';
import { useAuth } from './AuthContext';

interface ClinicDataContextValue {
  loading: boolean;
  error: string | null;
  clients: Client[];
  patients: Patient[];
  appointments: Appointment[];
  vaccinations: VaccinationRecord[];
  tasks: Task[];
  stocks: StockItem[];
  invoices: Invoice[];
  hospitalizations: HospitalizationBox[];
  reportsOverview: ReportsOverview | null;
  todayCashSummary: CashClosingSummary | null;
  refreshAll: () => Promise<void>;

  // Clients
  createClient: (input: Partial<Client>) => Promise<Client>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<Client>;
  archiveClient: (id: string) => Promise<{ action: 'deleted' | 'archived'; reason?: string }>;

  // Patients
  createPatient: (input: Partial<Patient>) => Promise<Patient>;
  updatePatient: (id: string, updates: Partial<Patient>) => Promise<Patient>;
  archivePatient: (id: string) => Promise<{ action: 'deleted' | 'archived'; reason?: string }>;

  // Appointments
  createAppointment: (input: Partial<Appointment>) => Promise<Appointment>;
  updateAppointment: (id: string, updates: Partial<Appointment>) => Promise<Appointment>;
  deleteAppointment: (id: string) => Promise<void>;

  // Vaccinations
  createVaccination: (input: Partial<VaccinationRecord>) => Promise<VaccinationRecord>;

  // Tasks
  createTask: (input: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  toggleTaskCompletion: (id: string) => Promise<Task>;
  addTaskComment: (taskId: string, text: string) => Promise<Task>;

  // Inventory
  createStock: (input: Partial<StockItem>) => Promise<StockItem>;
  adjustStock: (id: string, delta: number, reason?: string) => Promise<StockItem>;

  // Invoices
  createInvoice: (input: any) => Promise<Invoice>;
  updateInvoice: (id: string, updates: any) => Promise<Invoice>;

  // Hospitalization
  createHospitalization: (input: any) => Promise<HospitalizationBox>;
  updateHospitalization: (id: string, updates: any) => Promise<HospitalizationBox>;
}

const ClinicDataContext = createContext<ClinicDataContextValue | null>(null);

export const ClinicDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [vaccinations, setVaccinations] = useState<VaccinationRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [hospitalizations, setHospitalizations] = useState<HospitalizationBox[]>([]);
  const [reportsOverview, setReportsOverview] = useState<ReportsOverview | null>(null);
  const [todayCashSummary, setTodayCashSummary] = useState<CashClosingSummary | null>(null);

  const activeClinicId = session.activeClinic?.id;

  const refreshAll = useCallback(async () => {
    if (!session.authenticated || !activeClinicId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [
        ownersRes,
        animalsRes,
        aptsRes,
        vacsRes,
        tasksRes,
        stocksRes,
        invsRes,
        hospsRes,
        reportsRes,
        cashRes,
      ] = await Promise.all([
        api.get<Client[]>('/api/owners'),
        api.get<Patient[]>('/api/animals'),
        api.get<Appointment[]>('/api/appointments'),
        api.get<VaccinationRecord[]>('/api/vaccinations'),
        api.get<Task[]>('/api/tasks'),
        api.get<StockItem[]>('/api/inventory'),
        api.get<Invoice[]>('/api/invoices'),
        api.get<HospitalizationBox[]>('/api/hospitalizations'),
        api.get<ReportsOverview>('/api/reports/overview'),
        api.get<CashClosingSummary>('/api/cash-closings?date=2026-08-14'),
      ]);

      setClients(ownersRes);
      setPatients(animalsRes);
      setAppointments(aptsRes);
      setVaccinations(vacsRes);
      setTasks(tasksRes);
      setStocks(stocksRes);
      setInvoices(invsRes);
      setHospitalizations(hospsRes);
      setReportsOverview(reportsRes);
      setTodayCashSummary(cashRes);
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Impossible de charger les données du cabinet depuis le serveur.'
      );
    } finally {
      setLoading(false);
    }
  }, [session.authenticated, activeClinicId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const createClient = async (input: Partial<Client>) => {
    const created = await api.post<Client>('/api/owners', input);
    await refreshAll();
    return created;
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    const updated = await api.patch<Client>(`/api/owners/${encodeURIComponent(id)}`, updates);
    await refreshAll();
    return updated;
  };

  const archiveClient = async (id: string) => {
    const res = await api.delete<{ action: 'deleted' | 'archived'; reason?: string }>(
      `/api/owners/${encodeURIComponent(id)}`
    );
    await refreshAll();
    return res;
  };

  const createPatient = async (input: Partial<Patient>) => {
    const created = await api.post<Patient>('/api/animals', input);
    await refreshAll();
    return created;
  };

  const updatePatient = async (id: string, updates: Partial<Patient>) => {
    const updated = await api.patch<Patient>(`/api/animals/${encodeURIComponent(id)}`, updates);
    await refreshAll();
    return updated;
  };

  const archivePatient = async (id: string) => {
    const res = await api.delete<{ action: 'deleted' | 'archived'; reason?: string }>(
      `/api/animals/${encodeURIComponent(id)}`
    );
    await refreshAll();
    return res;
  };

  const createAppointment = async (input: Partial<Appointment>) => {
    const created = await api.post<Appointment>('/api/appointments', input);
    await refreshAll();
    return created;
  };

  const updateAppointment = async (id: string, updates: Partial<Appointment>) => {
    const updated = await api.patch<Appointment>(`/api/appointments/${encodeURIComponent(id)}`, updates);
    await refreshAll();
    return updated;
  };

  const deleteAppointment = async (id: string) => {
    await api.delete(`/api/appointments/${encodeURIComponent(id)}`);
    await refreshAll();
  };

  const createVaccination = async (input: Partial<VaccinationRecord>) => {
    const created = await api.post<VaccinationRecord>('/api/vaccinations', input);
    await refreshAll();
    return created;
  };

  const createTask = async (input: Partial<Task>) => {
    const created = await api.post<Task>('/api/tasks', input);
    await refreshAll();
    return created;
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    const updated = await api.patch<Task>(`/api/tasks/${encodeURIComponent(id)}`, updates);
    await refreshAll();
    return updated;
  };

  const toggleTaskCompletion = async (id: string) => {
    const target = tasks.find((t) => t.id === id);
    const updated = await api.patch<Task>(`/api/tasks/${encodeURIComponent(id)}`, {
      completed: target ? !target.completed : true,
    });
    await refreshAll();
    return updated;
  };

  const addTaskComment = async (taskId: string, text: string) => {
    const updated = await api.post<Task>(`/api/tasks/${encodeURIComponent(taskId)}/comments`, { text });
    await refreshAll();
    return updated;
  };

  const createStock = async (input: Partial<StockItem>) => {
    const created = await api.post<StockItem>('/api/inventory', input);
    await refreshAll();
    return created;
  };

  const adjustStock = async (id: string, delta: number, reason?: string) => {
    const updated = await api.patch<StockItem>(`/api/inventory/${encodeURIComponent(id)}`, {
      delta,
      reason,
    });
    await refreshAll();
    return updated;
  };

  const createInvoice = async (input: any) => {
    const created = await api.post<Invoice>('/api/invoices', input);
    await refreshAll();
    return created;
  };

  const updateInvoice = async (id: string, updates: any) => {
    const updated = await api.patch<Invoice>(`/api/invoices/${encodeURIComponent(id)}`, updates);
    await refreshAll();
    return updated;
  };

  const createHospitalization = async (input: any) => {
    const created = await api.post<HospitalizationBox>('/api/hospitalizations', input);
    await refreshAll();
    return created;
  };

  const updateHospitalization = async (id: string, updates: any) => {
    const updated = await api.patch<HospitalizationBox>(
      `/api/hospitalizations/${encodeURIComponent(id)}`,
      updates
    );
    await refreshAll();
    return updated;
  };

  return (
    <ClinicDataContext.Provider
      value={{
        loading,
        error,
        clients,
        patients,
        appointments,
        vaccinations,
        tasks,
        stocks,
        invoices,
        hospitalizations,
        reportsOverview,
        todayCashSummary,
        refreshAll,
        createClient,
        updateClient,
        archiveClient,
        createPatient,
        updatePatient,
        archivePatient,
        createAppointment,
        updateAppointment,
        deleteAppointment,
        createVaccination,
        createTask,
        updateTask,
        toggleTaskCompletion,
        addTaskComment,
        createStock,
        adjustStock,
        createInvoice,
        updateInvoice,
        createHospitalization,
        updateHospitalization,
      }}
    >
      {children}
    </ClinicDataContext.Provider>
  );
};

export function useClinicData(): ClinicDataContextValue {
  const ctx = useContext(ClinicDataContext);
  if (!ctx) throw new Error('useClinicData must be used inside ClinicDataProvider');
  return ctx;
}
