import React, { useState, useEffect, useCallback } from 'react';
import {
  Settings,
  Building,
  Users,
  Check,
  Database,
  Radio,
  Clock,
  Send,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  Palette,
  CheckCircle2,
  Download,
  Languages,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { LANGUAGE_OPTIONS } from '../i18n';
import { api, ApiError } from '../services/apiClient';
import {
  inspectLegacyLocalStorage,
  downloadLegacyLocalStorageBackup,
  type LegacyLocalStorageSnapshot,
} from '../services/storage';
import { calculateClientSmsSegments } from '../utils/smsCalc';
import type { MigrationReport, SmsConfig } from '../types';

export const SettingsPage: React.FC = () => {
  const { session, refreshSession } = useAuth();
  const { refreshAll } = useClinicData();
  const { language, setLanguage, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'general' | 'appearance' | 'database' | 'sms'>('general');
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // General clinic info initialized from authenticated activeClinic
  const [clinicName, setClinicName] = useState(session.activeClinic?.name || 'My Vet — Cabinet Vétérinaire');
  const [slogan, setSlogan] = useState(
    session.activeClinic?.slogan || 'Le bien-être de vos compagnons, notre priorité'
  );
  const [address, setAddress] = useState(
    session.activeClinic?.address || 'Coopérative El Moustakbel n° CC3, Ouled Fayet, Alger'
  );
  const [phone, setPhone] = useState(session.activeClinic?.phone || '0797 63 87 04');
  const [email, setEmail] = useState(session.activeClinic?.email || 'contact@myvet.dz');

  useEffect(() => {
    if (session.activeClinic) {
      setClinicName(session.activeClinic.name);
      setSlogan(session.activeClinic.slogan);
      setAddress(session.activeClinic.address);
      setPhone(session.activeClinic.phone);
      setEmail(session.activeClinic.email || '');
    }
  }, [session.activeClinic]);

  // Backend & Database status + Legacy LocalStorage inspector
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [legacySnapshot, setLegacySnapshot] = useState<LegacyLocalStorageSnapshot>(() =>
    inspectLegacyLocalStorage()
  );
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationReport | null>(null);

  // SMS Gateway Config
  const [smsConfig, setSmsConfig] = useState<SmsConfig>({
    provider_mode: 'TEST',
    active_provider: 'Ooredoo_Business_Algeria',
    api_key_configured: false,
    enable_vaccination_reminders: true,
    vaccination_intervals: '7,3,1',
    enable_appointment_reminders: true,
    appointment_interval_hours: 24,
    sending_start_hour: 8,
    sending_end_hour: 20,
    timezone: 'Africa/Algiers',
  });
  const [isTriggeringCron, setIsTriggeringCron] = useState(false);
  const [cronResult, setCronResult] = useState<any>(null);

  const [testMessage, setTestMessage] = useState(
    'Cabinet My Vet: Rappel vaccin pour Rocky prévu le 20/08/2026. Coopérative El Moustakbel, Ouled Fayet. Tel: 0797 63 87 04.'
  );
  const testCalc = calculateClientSmsSegments(testMessage);

  const loadBackendStatus = useCallback(async () => {
    try {
      const [status, cfg] = await Promise.all([
        api.get<any>('/api/system/status'),
        api.get<SmsConfig>('/api/sms/config'),
      ]);
      setDbStatus(status);
      if (cfg) setSmsConfig(cfg);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.settings.loadError);
    }
  }, [t.settings.loadError]);

  useEffect(() => {
    loadBackendStatus();
    setLegacySnapshot(inspectLegacyLocalStorage());
  }, [loadBackendStatus]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await api.patch('/api/clinic', {
        name: clinicName,
        slogan,
        address,
        phone,
        email,
      });
      await refreshSession();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.settings.saveGeneralError);
    }
  };

  const handleSaveSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const updated = await api.put<SmsConfig>('/api/sms/config', {
        provider_mode: smsConfig.provider_mode,
        active_provider: smsConfig.active_provider,
        enable_vaccination_reminders: smsConfig.enable_vaccination_reminders,
        vaccination_intervals: smsConfig.vaccination_intervals,
        enable_appointment_reminders: smsConfig.enable_appointment_reminders,
        appointment_interval_hours: smsConfig.appointment_interval_hours,
        sending_start_hour: smsConfig.sending_start_hour,
        sending_end_hour: smsConfig.sending_end_hour,
        timezone: smsConfig.timezone,
      });
      setSmsConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.settings.saveSmsError);
    }
  };

  const handleRunMigration = async (dryRun: boolean) => {
    setIsMigrating(true);
    setMigrationResult(null);
    setErrorMsg(null);
    try {
      const snap = inspectLegacyLocalStorage();
      setLegacySnapshot(snap);
      const res = await api.post<MigrationReport>('/api/system/migrate', {
        dryRun,
        sourceFormat: 'vetosuite-localstorage',
        clients: snap.clients,
        patients: snap.patients,
        appointments: snap.appointments,
        tasks: snap.tasks,
        stocks: snap.stocks,
        vaccinations: snap.vaccinations,
        consultations: snap.consultations,
        vitals: snap.vitals,
        notes: snap.notes,
        documents: snap.documents,
        treatments: snap.treatments,
        reminders: snap.reminders,
        communications: snap.communications,
        legacyV1Blob: snap.legacyV1Blob,
      });
      setMigrationResult(res);
      if (!dryRun) {
        await Promise.all([loadBackendStatus(), refreshAll()]);
      }
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.settings.migrationError);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleTriggerCron = async () => {
    setIsTriggeringCron(true);
    setCronResult(null);
    setErrorMsg(null);
    try {
      const res = await api.post('/api/cron/process-reminders', { bypassWindow: true });
      setCronResult(res);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.settings.cronError);
    } finally {
      setIsTriggeringCron(false);
    }
  };

  const isPgConnected = Boolean(dbStatus?.database?.connected);

  return (
    <div className="p-6 lg:p-8 max-w-[1240px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Settings className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.settings.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.settings.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#ECE2B1]/70 border border-[#ECE2B1] px-3.5 py-1.5 rounded-full text-xs font-semibold text-[#254222]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#99CC66]"></span>
          <span>{t.settings.systemActiveBadge}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#CAE4C5] pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[14px] font-bold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'general'
              ? 'bg-white border-t-2 border-x border-t-[#254222] border-x-[#CAE4C5] text-[#254222] -mb-px'
              : 'text-[#4A6644] hover:text-[#254222]'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>{t.settings.tabGeneral}</span>
        </button>

        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[14px] font-bold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'appearance'
              ? 'bg-white border-t-2 border-x border-t-[#254222] border-x-[#CAE4C5] text-[#254222] -mb-px'
              : 'text-[#4A6644] hover:text-[#254222]'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>{t.settings.tabAppearance}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#CAE4C5] text-[#254222] uppercase">
            {language.toUpperCase()}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[14px] font-bold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'database'
              ? 'bg-white border-t-2 border-x border-t-[#254222] border-x-[#CAE4C5] text-[#254222] -mb-px'
              : 'text-[#4A6644] hover:text-[#254222]'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>{t.settings.tabDatabase}</span>
        </button>

        <button
          onClick={() => setActiveTab('sms')}
          className={`flex items-center gap-2 px-4 py-2.5 text-[14px] font-bold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'sms'
              ? 'bg-white border-t-2 border-x border-t-[#254222] border-x-[#CAE4C5] text-[#254222] -mb-px'
              : 'text-[#4A6644] hover:text-[#254222]'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>{t.settings.tabSms}</span>
        </button>
      </div>

      {/* Tab 1: General */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-6">
          <form onSubmit={handleSaveGeneral} className="space-y-6">
            <div className="flex items-center gap-2 border-b border-[#CAE4C5]/70 pb-3">
              <Building className="w-5 h-5 text-[#254222]" />
              <h3 className="text-[16px] font-bold text-[#254222]">
                {t.settings.clinicCoordsHeading}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.settings.businessNameLabel}</label>
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.settings.sloganLabel}</label>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.settings.addressLabel}</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.settings.phoneLabel}</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none font-medium text-[#254222]"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.settings.emailLabel}</label>
                  <input
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-b border-[#CAE4C5]/70 pb-3 pt-4">
              <Users className="w-5 h-5 text-[#254222]" />
              <h3 className="text-[16px] font-bold text-[#254222]">
                {t.settings.sessionTeamHeading}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {session.user && (
                <div className="p-3 bg-[#CAE4C5]/60 border border-[#99CC66] rounded-xl flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#254222] text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {session.user.avatarInitials}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-[13.5px] text-[#254222] truncate">
                      {session.user.fullName} {t.settings.connectedSuffix}
                    </div>
                    <div className="text-[12px] text-[#4A6644] truncate">
                      {t.settings.rolePrefix} {t.roles[session.activeRole as keyof typeof t.roles] || session.activeRole} · {session.user.email}
                    </div>
                  </div>
                </div>
              )}
              {[
                ...(session.user?.fullName !== 'Dr. Vétérinaire'
                  ? [{ name: 'Dr. Vétérinaire', role: t.roles.veterinarian, initials: 'DV' }]
                  : []),
                { name: 'Secrétariat Accueil', role: 'Réception & Caisse DZD', initials: 'AC' },
              ].map((m) => (
                <div key={m.name} className="p-3 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#CAE4C5] text-[#254222] font-bold text-xs flex items-center justify-center shrink-0">
                    {m.initials}
                  </span>
                  <div>
                    <div className="font-bold text-[13.5px] text-[#254222]">{m.name}</div>
                    <div className="text-[12px] text-[#4A6644]">{m.role}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t border-[#CAE4C5]/70">
              <button
                type="submit"
                className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {saved && <Check className="w-4 h-4" />}
                <span>{saved ? t.settings.savedSuccessBtn : t.settings.saveClinicBtn}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Appearance & Language */}
      {activeTab === 'appearance' && (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-8">
          <div className="border-b border-[#CAE4C5]/70 pb-4">
            <h2 className="text-[18px] font-bold text-[#254222] flex items-center gap-2">
              <Palette className="w-5 h-5 text-[#254222]" />
              <span>{t.settings.appearanceTitle}</span>
            </h2>
            <p className="text-[13px] text-[#4A6644] mt-1">
              {t.settings.appearanceDesc}
            </p>
          </div>

          <div className="p-5 rounded-2xl border-2 border-[#99CC66] bg-[#F7FAF4] shadow-xs">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#ECE2B1] border border-[#99CC66]/40 text-[#254222] flex items-center justify-center shrink-0">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[15px] text-[#254222]">{t.settings.lightCardTitle}</h3>
                  <p className="text-xs text-[#4A6644]">{t.settings.lightCardSub}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[#CAE4C5] text-[#254222] border border-[#99CC66]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t.settings.activeBadge}</span>
              </span>
            </div>
            <p className="text-xs text-[#4A6644] leading-relaxed">
              {t.settings.lightCardDesc}
            </p>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#CAE4C5]/60">
              <span className="w-5 h-5 rounded-full bg-[#254222] border border-[#CAE4C5]/50" title="#254222" />
              <span className="w-5 h-5 rounded-full bg-[#99CC66] border border-[#254222]/20" title="#99CC66" />
              <span className="w-5 h-5 rounded-full bg-[#CAE4C5] border border-[#254222]/20" title="#CAE4C5" />
              <span className="w-5 h-5 rounded-full bg-[#ECE2B1] border border-[#254222]/20" title="#ECE2B1" />
            </div>
          </div>

          {/* Language Switcher Section */}
          <div className="border-t border-[#CAE4C5]/70 pt-6 space-y-4">
            <div>
              <h3 className="text-[17px] font-bold text-[#254222] flex items-center gap-2">
                <Languages className="w-5 h-5 text-[#254222]" />
                <span>{t.settings.languageSectionTitle}</span>
              </h3>
              <p className="text-[13px] text-[#4A6644] mt-1">
                {t.settings.languageSectionDesc}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {LANGUAGE_OPTIONS.map((opt) => {
                const isSelected = language === opt.code;
                const desc =
                  opt.code === 'fr'
                    ? t.settings.langFrDesc
                    : opt.code === 'en'
                    ? t.settings.langEnDesc
                    : t.settings.langArDesc;

                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setLanguage(opt.code)}
                    data-testid={`settings-lang-${opt.code}`}
                    className={`text-start p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#99CC66] bg-[#CAE4C5]/40 ring-4 ring-[#99CC66]/15 shadow-sm'
                        : 'border-[#CAE4C5] bg-[#F7FAF4] hover:border-[#99CC66]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-[#ECE2B1] border border-[#CAE4C5] text-[#254222] font-bold text-xs flex items-center justify-center shrink-0">
                          {opt.shortLabel}
                        </span>
                        <span className="font-bold text-[15px] text-[#254222]">
                          {opt.nativeLabel}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#CAE4C5] text-[#254222] border border-[#99CC66] shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{t.settings.activeBadge}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#4A6644] leading-relaxed">{desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Database & Non-destructive LocalStorage Migration */}
      {activeTab === 'database' && (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-6">
          <div>
            <h2 className="text-[18px] font-bold text-[#254222] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#254222]" />
              <span>{t.settings.dbTitle}</span>
            </h2>
            <p className="text-[13px] text-[#4A6644] mt-1">
              {t.settings.dbDesc}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl p-4 space-y-1">
              <span className="text-xs font-semibold text-[#4A6644] uppercase tracking-wider">{t.settings.storageEngineLabel}</span>
              <div className="text-[14px] font-bold text-[#254222] flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#99CC66] shrink-0"></span>
                <span>{t.settings.dbEngineReadyValue}</span>
              </div>
              <p className="text-xs text-[#4A6644]">
                {t.settings.dbSyncActiveSub}
              </p>
            </div>

            <div className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl p-4 space-y-1">
              <span className="text-xs font-semibold text-[#4A6644] uppercase tracking-wider">{t.settings.isolationCurrencyLabel}</span>
              <div className="text-[15px] font-bold text-[#254222] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" /> {t.settings.singleClinicDzdBadge}
              </div>
              <p className="text-xs text-[#4A6644]">
                {t.settings.activeClinicPrefix} {dbStatus?.clinic || session.activeClinic?.name || '—'}
              </p>
            </div>

            <div className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl p-4 space-y-1">
              <span className="text-xs font-semibold text-[#4A6644] uppercase tracking-wider">{t.settings.dataVolumeLabel}</span>
              <div className="text-[15px] font-bold text-[#254222]">
                {dbStatus?.database?.tables
                  ? Object.values(dbStatus.database.tables as Record<string, number>).reduce((a, b) => a + b, 0)
                  : '—'}{' '}
                {t.settings.recordsWord}
              </div>
              <p className="text-xs text-[#4A6644]">{t.settings.dataVolumeSub}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              { id: 'owners', title: t.settings.tableOwnersTitle, desc: t.settings.tableOwnersDesc, count: dbStatus?.database?.tables?.owners },
              { id: 'animals', title: t.settings.tableAnimalsTitle, desc: t.settings.tableAnimalsDesc, count: dbStatus?.database?.tables?.animals },
              { id: 'vaccinations', title: t.settings.tableVaccinesTitle, desc: t.settings.tableVaccinesDesc, count: dbStatus?.database?.tables?.vaccinations },
              { id: 'appointments', title: t.settings.tableAppointmentsTitle, desc: t.settings.tableAppointmentsDesc, count: dbStatus?.database?.tables?.appointments },
              { id: 'invoices', title: t.settings.tableInvoicesTitle, desc: t.settings.tableInvoicesDesc, count: dbStatus?.database?.tables?.invoices },
              { id: 'stocks', title: t.settings.tableStocksTitle, desc: t.settings.tableStocksDesc, count: dbStatus?.database?.tables?.stocks },
              { id: 'reminders', title: t.settings.tableRemindersTitle, desc: t.settings.tableRemindersDesc, count: dbStatus?.database?.tables?.smsReminders },
              { id: 'logs', title: t.settings.tableLogsTitle, desc: t.settings.tableLogsDesc, count: dbStatus?.database?.tables?.smsLogs },
            ].map((tbl) => (
              <div key={tbl.id} className="p-2.5 bg-white border border-[#CAE4C5] rounded-lg space-y-0.5">
                <div className="font-bold text-[#254222]">{tbl.title}</div>
                <div className="text-[#4A6644]">{tbl.desc}</div>
                <div className="font-semibold text-[#254222] pt-1">{tbl.count ?? 0} {t.settings.recordsWord}</div>
              </div>
            ))}
          </div>

          {/* Safe Local Backup & Archive Inspector */}
          <div className="bg-[#ECE2B1]/60 border border-[#ECE2B1] rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <RefreshCw className={`w-5 h-5 text-[#254222] shrink-0 mt-0.5 ${isMigrating ? 'animate-spin' : ''}`} />
              <div className="space-y-1">
                <h4 className="font-bold text-[14px] text-[#254222]">
                  {t.settings.migrationTitle}
                </h4>
                <p className="text-[13px] text-[#4A6644]">
                  {t.settings.migrationDesc}
                </p>
              </div>
            </div>

            <div className="p-3 bg-white rounded-xl border border-[#CAE4C5] text-xs text-[#4A6644] space-y-1">
              <div>
                <strong>{t.settings.browserDetectedLabel}</strong>{' '}
                {legacySnapshot.hasAnyLegacyData
                  ? `${legacySnapshot.clients.length} / ${legacySnapshot.patients.length} / ${legacySnapshot.appointments.length} / ${legacySnapshot.tasks.length} / ${legacySnapshot.stocks.length}`
                  : t.settings.noLegacyData}
              </div>
              {legacySnapshot.foundKeys.length > 0 && (
                <div className="text-[11px] text-[#5E7F52] font-medium">
                  {t.settings.archiveFoundCountPrefix} {legacySnapshot.foundKeys.length} {t.settings.archiveFoundCountSuffix}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={downloadLegacyLocalStorageBackup}
                className="bg-white border border-[#CAE4C5] hover:bg-[#F7FAF4] text-[#254222] px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#254222]" />
                <span>{t.settings.downloadJsonBackupBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => handleRunMigration(true)}
                disabled={isMigrating}
                className="bg-white border border-[#254222] text-[#254222] hover:bg-[#CAE4C5] disabled:opacity-50 px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors cursor-pointer"
              >
                {t.settings.dryRunBtn}
              </button>

              <button
                type="button"
                onClick={() => handleRunMigration(false)}
                disabled={isMigrating}
                className="bg-[#254222] hover:bg-[#1B3219] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Database className="w-4 h-4" />
                <span>{isMigrating ? t.settings.migratingBtn : t.settings.migrateBtn}</span>
              </button>
            </div>

            {migrationResult && (
              <div className="p-3.5 bg-white border border-[#CAE4C5] rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-[#254222] flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  <span>
                    {migrationResult.dryRun
                      ? t.settings.dryRunSuccess
                      : migrationResult.alreadyImported
                      ? t.settings.alreadyImported
                      : t.settings.migrationSuccess}
                  </span>
                </div>
                <div className="text-[#4A6644]">
                  {t.settings.importSummaryOwners}: +{migrationResult.summary.importedOwners} ({migrationResult.summary.skippedOwners}) ·{' '}
                  {t.settings.importSummaryPatients}: +{migrationResult.summary.importedAnimals} ·{' '}
                  {t.settings.importSummaryAppointments}: +{migrationResult.summary.importedAppointments} ·{' '}
                  {t.settings.importSummaryStocks}: +{migrationResult.summary.importedStocks} ·{' '}
                  {t.settings.importSummaryInvoices}: +{migrationResult.summary.importedInvoices}
                </div>
                {migrationResult.warnings.length > 0 && (
                  <div className="text-amber-700 pt-1">
                    {t.settings.warningsPrefix} {migrationResult.warnings.join(' · ')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: SMS Gateway & Vercel Cron */}
      {activeTab === 'sms' && (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-6">
          <form onSubmit={handleSaveSms} className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-[#254222]" />
                <h3 className="text-[16px] font-bold text-[#254222]">
                  {t.settings.smsGatewayConfigTitle}
                </h3>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  smsConfig.provider_mode === 'TEST'
                    ? 'bg-[#ECE2B1] text-[#254222] border border-[#99CC66]/50'
                    : 'bg-[#DC2626]/10 text-[#DC2626] border border-[#DC2626]/20'
                }`}
              >
                {smsConfig.provider_mode === 'TEST' ? t.settings.smsModeTestBadge : t.settings.smsModeProdBadge}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                  {t.settings.smsOperatorLabel}
                </label>
                <select
                  value={smsConfig.active_provider}
                  onChange={(e) => setSmsConfig({ ...smsConfig, active_provider: e.target.value })}
                  className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
                >
                  <option value="Ooredoo_Business_Algeria">Ooredoo Business (05)</option>
                  <option value="Mobilis_Entreprise">Mobilis Entreprise (06)</option>
                  <option value="Djezzy_Enterprise">Djezzy Enterprise (07)</option>
                  <option value="Direct_Gateway_Algeria">Direct Gateway Algeria</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.settings.smsOpModeLabel}</label>
                <select
                  value={smsConfig.provider_mode}
                  onChange={(e) => setSmsConfig({ ...smsConfig, provider_mode: e.target.value as 'TEST' | 'PRODUCTION' })}
                  className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
                >
                  <option value="TEST">{t.settings.smsOpModeTestOption}</option>
                  <option value="PRODUCTION">{t.settings.smsOpModeProdOption}</option>
                </select>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                  {t.settings.legalWindowLabel}
                </label>
                <div className="flex items-center gap-2" dir="ltr">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={smsConfig.sending_start_hour}
                    onChange={(e) => setSmsConfig({ ...smsConfig, sending_start_hour: parseInt(e.target.value, 10) || 8 })}
                    className="w-20 px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl text-center"
                  />
                  <span className="text-sm text-[#4A6644]">h00 —</span>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={smsConfig.sending_end_hour}
                    onChange={(e) => setSmsConfig({ ...smsConfig, sending_end_hour: parseInt(e.target.value, 10) || 20 })}
                    className="w-20 px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl text-center"
                  />
                  <span className="text-sm text-[#4A6644]">h00</span>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                  {t.settings.vaccineIntervalsLabel}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={smsConfig.vaccination_intervals}
                  onChange={(e) => setSmsConfig({ ...smsConfig, vaccination_intervals: e.target.value })}
                  placeholder="7,3,1"
                  className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#254222]" />
                  <h4 className="font-bold text-[14.5px] text-[#254222]">
                    {t.settings.vercelCronTitle}
                  </h4>
                </div>
                <span className="text-xs bg-[#CAE4C5] text-[#254222] px-2.5 py-1 rounded-md font-semibold">
                  {t.settings.schedulerConnectionBadge}
                </span>
              </div>

              <p className="text-[13px] text-[#4A6644]">
                {t.settings.vercelCronDesc}
              </p>

              <button
                type="button"
                onClick={handleTriggerCron}
                disabled={isTriggeringCron}
                className="bg-[#254222] hover:bg-[#1B3219] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-[13px] font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
              >
                <Send className="w-4 h-4" />
                <span>{isTriggeringCron ? t.settings.triggeringCronBtn : t.settings.triggerCronBtn}</span>
              </button>

              {cronResult && (
                <div className="p-3 bg-white border border-[#CAE4C5] rounded-lg text-xs space-y-1">
                  <div className="font-bold text-[#254222]">{t.settings.cronReportTitle}</div>
                  <div className="text-[#254222] font-medium">
                    {t.settings.cronProcessedLabel} {cronResult.results?.processed || 0} &bull;{' '}
                    {t.settings.cronSentLabel} {cronResult.results?.sent || 0} &bull;{' '}
                    {t.settings.cronDeferredLabel} {cronResult.results?.deferred || 0}
                  </div>
                  {cronResult.message && <div className="text-[#4A6644]">{cronResult.message}</div>}
                </div>
              )}
            </div>

            <div className="border border-[#CAE4C5] rounded-xl p-5 space-y-3 bg-white">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="font-bold text-[14px] text-[#254222] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-[#254222]" />
                  {t.settings.gsmSimTitle}
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      testCalc.encoding === 'GSM-7' ? 'bg-[#CAE4C5] text-[#254222]' : 'bg-[#ECE2B1] text-[#254222]'
                    }`}
                  >
                    {testCalc.encoding === 'GSM-7' ? t.sms.formatStandardLabel : t.sms.formatUnicodeLabel}
                  </span>
                  <span className="font-semibold text-[#254222]">
                    {testCalc.segments} {t.sms.messagesWord} ({testCalc.charCount})
                  </span>
                </div>
              </div>

              <textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full p-3 text-[13.5px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#4A6644]">
                <div>
                  {t.settings.encodingLabel}{' '}
                  <b className="text-[#254222]">
                    {testCalc.encoding === 'GSM-7' ? t.sms.formatStandardLabel : t.sms.formatUnicodeLabel}
                  </b>
                </div>
                <div>{t.settings.segmentsLabel} <b className="text-[#254222]">{testCalc.segments}</b></div>
                <div>{t.settings.remainingCharsLabel} <b className="text-[#254222]">{testCalc.remainingInSegment}</b></div>
                <div>{t.settings.maxPerSegmentLabel} <b className="text-[#254222]">{testCalc.maxPerSegment}</b></div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-[#CAE4C5]/70">
              <button
                type="submit"
                className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {saved && <Check className="w-4 h-4" />}
                <span>{saved ? t.settings.configSavedBtn : t.settings.saveSmsConfigBtn}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
