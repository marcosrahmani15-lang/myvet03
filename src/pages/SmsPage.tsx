import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MessageSquare,
  Clock,
  History,
  FileText,
  Settings,
  Send,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ShieldCheck,
  Smartphone,
  Calendar,
  X,
  Sparkles,
  Info,
  CheckCheck,
  XCircle,
  RotateCcw,
  QrCode,
  Search,
  UserCheck,
  Radio,
  Sliders,
  KeyRound,
  Link2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { calculateClientSmsSegments } from '../utils/smsCalc';
import { formatAlgerianPhone } from '../utils/phoneUtils';
import { Modal } from '../components/common/Modal';
import { api, ApiError } from '../services/apiClient';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { formatLocalizedDate } from '../i18n';
import type { SmsConfig, SmsLog, SmsReminder, SmsTemplate } from '../types';

type TabType = 'overview' | 'scheduled' | 'history' | 'templates' | 'settings';

function safeParseJson(raw?: string | null): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

type DirectTemplateKey = 'appointment' | 'vaccination' | 'pickup' | 'followup' | 'custom';

function buildClinicalTemplateMessage(
  key: DirectTemplateKey,
  lang: 'fr' | 'en' | 'ar',
  ownerName: string,
  animalName: string
): string {
  const client = ownerName.trim() || (lang === 'ar' ? 'عميلنا الكريم' : lang === 'en' ? 'Client' : 'Client');
  const pet = animalName.trim() || (lang === 'ar' ? 'حيوانكم الأليف' : lang === 'en' ? 'your pet' : 'votre compagnon');

  if (key === 'appointment') {
    if (lang === 'ar') {
      return `مرحباً ${client}، عيادة My Vet تذكركم بموعد ${pet} في أولاد فايت. للاستفسار: 0797 63 87 04.`;
    }
    if (lang === 'en') {
      return `Hello ${client}, My Vet Clinic reminds you of your appointment for ${pet} in Ouled Fayet. Tel: 0797 63 87 04.`;
    }
    return `Bonjour ${client}, Cabinet My Vet vous rappelle votre rendez-vous pour ${pet} à Ouled Fayet. Tel: 0797 63 87 04.`;
  }

  if (key === 'vaccination') {
    if (lang === 'ar') {
      return `مرحباً ${client}، حان موعد تذكير التطعيم لـ ${pet} في عيادة My Vet (أولاد فايت). الهاتف: 0797 63 87 04.`;
    }
    if (lang === 'en') {
      return `Hello ${client}, the vaccination booster for ${pet} is due soon at My Vet Clinic (Ouled Fayet). Tel: 0797 63 87 04.`;
    }
    return `Bonjour ${client}, le rappel de vaccin pour ${pet} arrive à échéance au Cabinet My Vet (Ouled Fayet). Tel: 0797 63 87 04.`;
  }

  if (key === 'pickup') {
    if (lang === 'ar') {
      return `مرحباً ${client}، ${pet} بصحة جيدة وجاهز للاستلام في عيادة My Vet (أولاد فايت). الهاتف: 0797 63 87 04.`;
    }
    if (lang === 'en') {
      return `Hello ${client}, ${pet} is doing well and is ready for pickup at My Vet Clinic (Ouled Fayet). Tel: 0797 63 87 04.`;
    }
    return `Bonjour ${client}, ${pet} se porte bien et est prêt(e) à être récupéré(e) au Cabinet My Vet (Ouled Fayet). Tel: 0797 63 87 04.`;
  }

  if (key === 'followup') {
    if (lang === 'ar') {
      return `مرحباً ${client}، نتائج الفحص / المتابعة الخاصة بـ ${pet} متوفرة في عيادة My Vet. الهاتف: 0797 63 87 04.`;
    }
    if (lang === 'en') {
      return `Hello ${client}, the follow-up / test results for ${pet} are available at My Vet Clinic (Ouled Fayet). Tel: 0797 63 87 04.`;
    }
    return `Bonjour ${client}, les résultats / le contrôle de suivi pour ${pet} sont disponibles au Cabinet My Vet. Tel: 0797 63 87 04.`;
  }

  if (lang === 'ar') {
    return `عيادة My Vet (أولاد فايت): مرحباً ${client}، بخصوص ${pet}: `;
  }
  if (lang === 'en') {
    return `My Vet Clinic (Ouled Fayet): Hello ${client}, regarding ${pet}: `;
  }
  return `Cabinet My Vet (Ouled Fayet): Bonjour ${client}, concernant ${pet}, `;
}

function triggerSmsUri(uri: string): void {
  const link = document.createElement('a');
  link.href = uri;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export const SmsPage: React.FC = () => {
  const { clients, patients } = useClinicData();
  const { language, locale, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const directCardRef = useRef<HTMLDivElement | null>(null);

  // Configuration
  const [config, setConfig] = useState<SmsConfig>({
    id: 'default',
    provider_mode: 'TEST',
    smsProviderMode: 'test',
    active_provider: 'Ooredoo_Business_Algeria',
    api_key_configured: false,
    smsApiUrl: '',
    smsApiKeyMasked: '',
    smsSenderId: 'MyVet',
    simPlanLabel: 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
    enable_vaccination_reminders: true,
    vaccination_intervals: '7,3,1',
    enable_appointment_reminders: true,
    appointment_interval_hours: 24,
    sending_start_hour: 8,
    sending_end_hour: 20,
    timezone: 'Africa/Algiers',
  });

  // SIM Gateway Config Modal State
  const [isSimConfigModalOpen, setIsSimConfigModalOpen] = useState(false);
  const [simPreset, setSimPreset] = useState<'textbee' | 'android_sms_gate' | 'pushcut' | 'custom'>('textbee');
  const [simForm, setSimForm] = useState({
    smsProviderMode: 'test' as 'test' | 'live',
    active_provider: 'Ooredoo_Business_Algeria',
    smsApiUrl: '',
    smsApiKey: '',
    smsSenderId: 'MyVet',
    simPlanLabel: 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
    textbeeDeviceId: '',
  });
  const [simTestPhone, setSimTestPhone] = useState('0555 55 55 55');
  const [isSavingSimConfig, setIsSavingSimConfig] = useState(false);
  const [isTestingSim, setIsTestingSim] = useState(false);
  const [simModalFeedback, setSimModalFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Scheduled Queue
  const [reminders, setReminders] = useState<SmsReminder[]>([]);
  const [reminderFilter, setReminderFilter] = useState<'ALL' | 'Scheduled' | 'Sent' | 'Failed'>('ALL');

  // Real Logs from Backend
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logStatusFilter, setLogStatusFilter] = useState<'ALL' | 'Delivered' | 'Sent' | 'Failed'>('ALL');
  const [selectedLogPayload, setSelectedLogPayload] = useState<SmsLog | null>(null);

  // Templates
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<SmsTemplate | null>(null);
  const [templateContent, setTemplateContent] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateCategory, setTemplateCategory] = useState<'VACCINATION' | 'APPOINTMENT' | 'POST_OP' | 'URGENCE'>('VACCINATION');

  // Direct SMS Composer State (1-Click SIM Gateway Primary + iPhone Fallback)
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(undefined);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>(undefined);
  const [directPhone, setDirectPhone] = useState('0555555555');
  const [directOwnerName, setDirectOwnerName] = useState('Fatima Mansouri');
  const [directAnimalName, setDirectAnimalName] = useState('Nina');
  const [activeDirectTemplate, setActiveDirectTemplate] = useState<DirectTemplateKey>('appointment');
  const [directMessage, setDirectMessage] = useState(() =>
    buildClinicalTemplateMessage('appointment', 'fr', 'Fatima Mansouri', 'Nina')
  );
  const [showQrCode, setShowQrCode] = useState(false);
  const [showFallbackIphone, setShowFallbackIphone] = useState(false);
  const [isSendingDirectMethod, setIsSendingDirectMethod] = useState<'iphone_bridge' | 'gateway' | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [cfgData, queueData, logsData, tplData] = await Promise.all([
        api.get<SmsConfig>('/api/sms/config'),
        api.get<SmsReminder[]>('/api/sms/reminders'),
        api.get<SmsLog[]>('/api/sms/history'),
        api.get<SmsTemplate[]>('/api/sms/templates'),
      ]);

      if (cfgData && cfgData.active_provider) {
        setConfig(cfgData);
      }
      if (Array.isArray(queueData)) {
        setReminders(queueData);
      }
      if (Array.isArray(logsData)) {
        setLogs(logsData);
      }
      if (Array.isArray(tplData) && tplData.length > 0) {
        setTemplates(tplData);
        setSelectedTemplate((prev) => {
          if (prev) {
            const match = tplData.find((t) => t.id === prev.id);
            if (match) return match;
          }
          setTemplateTitle(tplData[0].title);
          setTemplateContent(tplData[0].content);
          setTemplateCategory(tplData[0].category);
          return tplData[0];
        });
      }
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.sms.loadError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Keep default direct composer synced with first registered patient/client on initial mount
  useEffect(() => {
    if (selectedClientId || selectedPatientId || clients.length === 0) return;
    const firstPatient = patients[0];
    const matchingClient = firstPatient
      ? clients.find((c) => c.id === firstPatient.ownerId) || clients[0]
      : clients[0];
    if (!matchingClient) return;
    setSelectedClientId(matchingClient.id);
    setSelectedPatientId(firstPatient?.id);
    setDirectPhone(matchingClient.phone);
    setDirectOwnerName(matchingClient.name);
    setDirectAnimalName(firstPatient?.name || '');
    setDirectMessage(
      buildClinicalTemplateMessage(
        activeDirectTemplate,
        language,
        matchingClient.name,
        firstPatient?.name || ''
      )
    );
  }, [clients, patients, selectedClientId, selectedPatientId, activeDirectTemplate, language]);

  // Searchable Client + Pet Directory Options
  const directoryEntries = useMemo(() => {
    const entries: Array<{
      key: string;
      clientId: string;
      patientId?: string;
      clientName: string;
      phone: string;
      animalName: string;
      species?: string;
    }> = [];

    for (const p of patients) {
      const owner = clients.find((c) => c.id === p.ownerId);
      if (!owner) continue;
      entries.push({
        key: `${owner.id}:${p.id}`,
        clientId: owner.id,
        patientId: p.id,
        clientName: owner.name,
        phone: owner.phone,
        animalName: p.name,
        species: p.species,
      });
    }

    for (const c of clients) {
      if (!entries.some((e) => e.clientId === c.id)) {
        entries.push({
          key: `${c.id}:owner`,
          clientId: c.id,
          clientName: c.name,
          phone: c.phone,
          animalName: '',
        });
      }
    }

    return entries;
  }, [clients, patients]);

  const filteredDirectory = useMemo(() => {
    const q = recipientQuery.trim().toLowerCase();
    if (!q) return directoryEntries.slice(0, 8);
    return directoryEntries
      .filter(
        (item) =>
          item.clientName.toLowerCase().includes(q) ||
          item.animalName.toLowerCase().includes(q) ||
          item.phone.replace(/\s+/g, '').includes(q.replace(/\s+/g, ''))
      )
      .slice(0, 10);
  }, [directoryEntries, recipientQuery]);

  const handleSelectDirectoryEntry = (entry: (typeof directoryEntries)[number]) => {
    setSelectedClientId(entry.clientId);
    setSelectedPatientId(entry.patientId);
    setDirectPhone(entry.phone);
    setDirectOwnerName(entry.clientName);
    setDirectAnimalName(entry.animalName);
    setRecipientQuery(
      entry.animalName ? `${entry.clientName} — ${entry.animalName}` : entry.clientName
    );
    setIsPickerOpen(false);
    setDirectMessage(
      buildClinicalTemplateMessage(
        activeDirectTemplate,
        language,
        entry.clientName,
        entry.animalName
      )
    );
  };

  const handleClearSelection = () => {
    setSelectedClientId(undefined);
    setSelectedPatientId(undefined);
    setRecipientQuery('');
    setDirectOwnerName('');
    setDirectAnimalName('');
    setDirectPhone('');
    setIsPickerOpen(false);
  };

  const handleApplyDirectTemplate = (tplKey: DirectTemplateKey) => {
    setActiveDirectTemplate(tplKey);
    setDirectMessage(
      buildClinicalTemplateMessage(tplKey, language, directOwnerName, directAnimalName)
    );
  };

  const directPhoneInfo = useMemo(() => formatAlgerianPhone(directPhone), [directPhone]);
  const directSmsUri = useMemo(() => {
    const target = directPhoneInfo.isValid ? directPhoneInfo.e164 : directPhone.trim();
    return target ? `sms:${target}?&body=${encodeURIComponent(directMessage)}` : '';
  }, [directPhoneInfo, directPhone, directMessage]);

  const directCalc = calculateClientSmsSegments(directMessage);

  // Trigger Cron reminder processor
  const handleTriggerScheduler = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await api.post<{ results?: { sent?: number; claimed?: number; deferred?: number; failed?: number } }>(
        '/api/cron/process-reminders',
        { bypassWindow: true }
      );
      setStatusMessage(
        `${t.sms.schedulerResultPrefix} ${data.results?.sent || 0} ${t.sms.schedulerSentWord}, ${data.results?.deferred || 0} ${t.sms.schedulerDeferredWord}, ${data.results?.failed || 0} ${t.sms.schedulerFailedWord}.`
      );
      await fetchData();
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.schedulerError);
    } finally {
      setLoading(false);
    }
  };

  // Open & initialize SIM Gateway configuration modal
  const openSimConfigModal = () => {
    const url = config.smsApiUrl || '';
    const lower = url.toLowerCase();
    let detectedPreset: 'textbee' | 'android_sms_gate' | 'pushcut' | 'custom' = 'textbee';
    if (lower.includes('sms-gate.app') || lower.includes('/3rdparty/v1/message')) {
      detectedPreset = 'android_sms_gate';
    } else if (lower.includes('pushcut.io')) {
      detectedPreset = 'pushcut';
    } else if (url && !lower.includes('textbee.dev')) {
      detectedPreset = 'custom';
    }
    const devMatch = /\/devices\/([^/]+)\/send-sms/i.exec(url);

    setSimPreset(detectedPreset);
    setSimForm({
      smsProviderMode:
        config.smsProviderMode === 'live' || config.provider_mode === 'PRODUCTION' ? 'live' : 'test',
      active_provider: config.active_provider || 'Ooredoo_Business_Algeria',
      smsApiUrl: url,
      smsApiKey: '',
      smsSenderId: config.smsSenderId || 'MyVet',
      simPlanLabel: config.simPlanLabel || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
      textbeeDeviceId: devMatch ? devMatch[1] : '',
    });
    setSimTestPhone(directPhoneInfo.isValid ? directPhoneInfo.national : '0555 55 55 55');
    setSimModalFeedback(null);
    setIsSimConfigModalOpen(true);
  };

  const handleSelectSimPreset = (preset: 'textbee' | 'android_sms_gate' | 'pushcut' | 'custom') => {
    setSimPreset(preset);
    setSimForm((prev) => {
      let nextUrl = prev.smsApiUrl;
      const isEmptyOrTemplate =
        !nextUrl.trim() ||
        nextUrl.includes('textbee.dev') ||
        nextUrl.includes('sms-gate.app') ||
        nextUrl.includes('pushcut.io');
      if (isEmptyOrTemplate) {
        if (preset === 'textbee') {
          const devId = prev.textbeeDeviceId.trim() || 'DEVICE_ID';
          nextUrl = `https://api.textbee.dev/api/v1/gateway/devices/${devId}/send-sms`;
        } else if (preset === 'android_sms_gate') {
          nextUrl = 'https://api.sms-gate.app/3rdparty/v1/message';
        } else if (preset === 'pushcut') {
          nextUrl = 'https://api.pushcut.io/SECRET/notifications/MyVetSMS';
        } else if (preset === 'custom') {
          nextUrl = '';
        }
      }
      return { ...prev, smsApiUrl: nextUrl };
    });
  };

  const saveSimConfigRequest = async () => {
    const updated = await api.put<SmsConfig>('/api/sms/config', {
      smsProviderMode: simForm.smsProviderMode,
      provider_mode: simForm.smsProviderMode === 'live' ? 'PRODUCTION' : 'TEST',
      active_provider: simForm.active_provider,
      smsApiUrl: simForm.smsApiUrl.trim(),
      ...(simForm.smsApiKey.trim() ? { smsApiKey: simForm.smsApiKey.trim() } : {}),
      smsSenderId: simForm.smsSenderId.trim() || 'MyVet',
      simPlanLabel: simForm.simPlanLabel.trim() || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
    });
    setConfig(updated);
    setSimForm((prev) => ({ ...prev, smsApiKey: '' }));
    return updated;
  };

  const handleSaveSimGatewayModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSimConfig(true);
    setSimModalFeedback(null);
    setErrorMessage(null);
    try {
      await saveSimConfigRequest();
      setSimModalFeedback({ type: 'success', text: t.sms.configSavedNotice });
      setStatusMessage(t.sms.configSavedNotice);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setSimModalFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : t.sms.configSaveError,
      });
    } finally {
      setIsSavingSimConfig(false);
    }
  };

  const handleTestSimGatewayFromModal = async () => {
    const phoneCheck = formatAlgerianPhone(simTestPhone);
    if (!phoneCheck.isValid) {
      setSimModalFeedback({
        type: 'error',
        text: phoneCheck.error || t.sms.directSendError,
      });
      return;
    }

    setIsTestingSim(true);
    setSimModalFeedback(null);
    try {
      await saveSimConfigRequest();
      const res = await api.post<{
        success?: boolean;
        isSimulated?: boolean;
        status?: string;
        errorMessage?: string;
        phone?: { e164?: string };
      }>('/api/sms/send-direct', {
        recipientPhone: simTestPhone,
        recipientName: 'Test SIM MyVet',
        message: `Cabinet My Vet: Test passerelle ${simForm.simPlanLabel || 'SIM'} (${new Date().toLocaleTimeString('fr-FR')}).`,
        category: 'TEST_SIM',
      });

      await fetchData();
      if (res.success) {
        setSimModalFeedback({
          type: 'success',
          text: res.isSimulated
            ? `${t.sms.directGatewaySuccessPrefix} ${res.phone?.e164 || simTestPhone} ${t.sms.directGatewaySimSuffix}`
            : t.sms.simTestSuccessMsg,
        });
      } else {
        setSimModalFeedback({
          type: 'error',
          text: res.errorMessage || t.sms.directSendError,
        });
      }
    } catch (err: any) {
      setSimModalFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : t.sms.directSendError,
      });
    } finally {
      setIsTestingSim(false);
    }
  };

  // Real instant dispatch of a scheduled reminder via SIM Gateway
  const handleSendReminderNow = async (reminder: SmsReminder) => {
    setErrorMessage(null);
    setSendingReminderId(reminder.id);
    try {
      const res = await api.post<{
        success?: boolean;
        isSimulated?: boolean;
        errorMessage?: string;
      }>(`/api/sms/send-log/${encodeURIComponent(reminder.id)}`);

      if (res.success === false) {
        setErrorMessage(res.errorMessage || t.sms.reminderSendError);
      } else {
        setStatusMessage(
          res.isSimulated
            ? `${t.sms.reminderSentSimPrefix} ${reminder.owner_name} ${t.sms.reminderSentSimSuffix}`
            : `${t.sms.reminderSentProdPrefix} ${reminder.owner_name}.`
        );
        setTimeout(() => setStatusMessage(null), 4000);
      }
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.reminderSendError);
    } finally {
      setSendingReminderId(null);
    }
  };

  // One-click "Envoyer via iPhone" on a queued/pending reminder
  const handleSendReminderViaIphone = async (reminder: SmsReminder) => {
    setErrorMessage(null);
    setSendingReminderId(reminder.id);
    try {
      const isVaccination = reminder.reminder_type.startsWith('VACCINATION');
      const renderedMsg = buildClinicalTemplateMessage(
        isVaccination ? 'vaccination' : 'appointment',
        language,
        reminder.owner_name || '',
        reminder.animal_name || ''
      );

      const res = await api.post<{ smsUri?: string; phone?: { e164?: string } }>(
        '/api/sms/send-direct',
        {
          clientId: reminder.owner_id,
          patientId: reminder.animal_id,
          recipientPhone: reminder.owner_phone || reminder.phone_normalized || '',
          recipientName: reminder.owner_name || 'Client',
          animalName: reminder.animal_name || undefined,
          message: renderedMsg,
          category: reminder.reminder_type,
          dispatchMethod: 'iphone_bridge',
          reminderId: reminder.id,
        }
      );

      if (res.smsUri) {
        triggerSmsUri(res.smsUri);
      }
      setStatusMessage(
        `${t.sms.directIphoneSuccessPrefix} ${reminder.owner_name || ''} (${res.phone?.e164 || reminder.owner_phone || ''})`
      );
      await fetchData();
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.directSendError);
    } finally {
      setSendingReminderId(null);
    }
  };

  // Real cancellation of a scheduled reminder
  const handleCancelReminder = async (id: string) => {
    setErrorMessage(null);
    try {
      await api.post(`/api/sms/cancel/${encodeURIComponent(id)}`);
      setStatusMessage(t.sms.reminderCancelledNotice);
      await fetchData();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.reminderCancelError);
    }
  };

  // Retry failed reminder
  const handleRetryReminder = async (id: string) => {
    setErrorMessage(null);
    try {
      await api.post(`/api/sms/retry/${encodeURIComponent(id)}`);
      setStatusMessage(t.sms.reminderRetriedNotice);
      await fetchData();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.reminderRetryError);
    }
  };

  // Unified Direct SMS Dispatcher (1-click SIM Gateway primary or iPhone Bridge fallback)
  const handleSendDirectSms = async (method: 'iphone_bridge' | 'gateway' = 'gateway') => {
    if (!directPhone.trim() || !directMessage.trim()) return;
    setIsSendingDirectMethod(method);
    setErrorMessage(null);
    try {
      const categoryMap: Record<DirectTemplateKey, string> = {
        appointment: 'APPOINTMENT',
        vaccination: 'VACCINATION',
        pickup: 'PICKUP',
        followup: 'FOLLOW_UP',
        custom: 'DIRECT',
      };

      const res = await api.post<{
        success?: boolean;
        isSimulated?: boolean;
        smsUri?: string;
        errorMessage?: string;
        phone?: { e164?: string };
      }>('/api/sms/send-direct', {
        clientId: selectedClientId,
        patientId: selectedPatientId,
        recipientPhone: directPhone,
        recipientName: directOwnerName.trim() || undefined,
        animalName: directAnimalName.trim() || undefined,
        message: directMessage,
        category: categoryMap[activeDirectTemplate],
        ...(method === 'iphone_bridge' ? { dispatchMethod: 'iphone_bridge' } : {}),
      });

      if (method === 'iphone_bridge') {
        if (res.smsUri) {
          triggerSmsUri(res.smsUri);
        }
        setStatusMessage(
          `${t.sms.directIphoneSuccessPrefix} ${directOwnerName || res.phone?.e164 || directPhone} (${res.phone?.e164 || directPhone})`
        );
      } else {
        if (res.success === false) {
          setErrorMessage(res.errorMessage || t.sms.directSendError);
        } else {
          setStatusMessage(
            `${res.isSimulated ? t.sms.directGatewaySuccessPrefix : t.sms.simLiveSuccessPrefix} ${directOwnerName || directPhone} (${res.phone?.e164 || directPhone})${
              res.isSimulated ? ` ${t.sms.directGatewaySimSuffix}` : ''
            }`
          );
        }
      }

      setIsDirectModalOpen(false);
      await fetchData();
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.directSendError);
    } finally {
      setIsSendingDirectMethod(null);
    }
  };

  // Save template
  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !templateContent.trim()) return;
    setErrorMessage(null);
    try {
      await api.post('/api/sms/templates', {
        id: selectedTemplate?.id,
        category: templateCategory,
        title: templateTitle.trim(),
        content: templateContent.trim(),
        language: language === 'ar' ? 'ar' : 'fr',
      });
      setStatusMessage(t.sms.templateSavedNotice);
      await fetchData();
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.templateSaveError);
    }
  };

  // Save config
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const updated = await api.put<SmsConfig>('/api/sms/config', {
        provider_mode: config.provider_mode,
        smsProviderMode: config.provider_mode === 'PRODUCTION' ? 'live' : 'test',
        active_provider: config.active_provider,
        smsSenderId: config.smsSenderId?.trim() || 'MyVet',
        simPlanLabel: config.simPlanLabel?.trim() || 'Ooredoo 2500 (SMS Illimité Tous Réseaux)',
        enable_vaccination_reminders: config.enable_vaccination_reminders,
        vaccination_intervals: config.vaccination_intervals,
        enable_appointment_reminders: config.enable_appointment_reminders,
        appointment_interval_hours: config.appointment_interval_hours,
        sending_start_hour: config.sending_start_hour,
        sending_end_hour: config.sending_end_hour,
        timezone: config.timezone,
      });
      setConfig(updated);
      setStatusMessage(t.sms.configSavedNotice);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err instanceof ApiError ? err.message : t.sms.configSaveError);
    }
  };

  const handleInsertTag = (tag: string) => {
    setTemplateContent((prev) => prev + ` ${tag}`);
  };

  const templateCalc = calculateClientSmsSegments(templateContent);

  const filteredReminders = reminders.filter((r) => {
    if (reminderFilter === 'Scheduled') return r.status === 'Scheduled';
    if (reminderFilter === 'Sent') return r.status === 'Sent' || r.status === 'Delivered';
    if (reminderFilter === 'Failed') return r.status === 'Failed';
    return true;
  });

  const getLogStatusCategory = (status: string): 'Delivered' | 'Sent' | 'Failed' => {
    const s = (status || '').toLowerCase();
    if (s.includes('fail') || s.includes('echec') || s.includes('échec') || s.includes('err') || s.includes('cancel')) {
      return 'Failed';
    }
    if (s.includes('deliver') || s.includes('livr') || s.includes('délivr')) {
      return 'Delivered';
    }
    return 'Sent';
  };

  const countDelivered = logs.filter((l) => getLogStatusCategory(l.status) === 'Delivered').length;
  const countSent = logs.filter((l) => getLogStatusCategory(l.status) === 'Sent').length;
  const countFailed = logs.filter((l) => getLogStatusCategory(l.status) === 'Failed').length;

  const deliverabilityRate =
    logs.length === 0 ? null : Math.round(((countDelivered + countSent) / logs.length) * 100);

  // Real Algerian mobile carrier distribution from registered clinic clients
  const carrierCounts = { Ooredoo: 0, Mobilis: 0, Djezzy: 0 };
  for (const c of clients) {
    const { carrier } = formatAlgerianPhone(c.phone);
    if (carrier === 'Ooredoo') carrierCounts.Ooredoo += 1;
    else if (carrier === 'Mobilis') carrierCounts.Mobilis += 1;
    else if (carrier === 'Djezzy') carrierCounts.Djezzy += 1;
  }
  const carrierTotal = carrierCounts.Ooredoo + carrierCounts.Mobilis + carrierCounts.Djezzy;
  const carrierPct = {
    Ooredoo: carrierTotal ? Math.round((carrierCounts.Ooredoo / carrierTotal) * 100) : 0,
    Mobilis: carrierTotal ? Math.round((carrierCounts.Mobilis / carrierTotal) * 100) : 0,
    Djezzy: carrierTotal ? Math.round((carrierCounts.Djezzy / carrierTotal) * 100) : 0,
  };

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.recipient_name.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.recipient_phone.includes(logSearch) ||
      l.message_content.toLowerCase().includes(logSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (logStatusFilter === 'ALL') return true;
    return getLogStatusCategory(l.status) === logStatusFilter;
  });

  const translateReminderStatus = (status: string) => {
    if (status === 'Scheduled') return t.sms.reminderStatusScheduled;
    if (status === 'Sent') return t.sms.reminderStatusSent;
    if (status === 'Delivered') return t.sms.reminderStatusDelivered;
    if (status === 'Failed') return t.sms.reminderStatusFailed;
    if (status === 'Cancelled') return t.sms.reminderStatusCancelled;
    return status;
  };

  const renderLogStatusBadge = (status: string, compact = false) => {
    const category = getLogStatusCategory(status);

    if (category === 'Delivered') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-bold transition-all shadow-2xs ${
            compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
          } bg-[#CAE4C5] text-[#254222] border border-[#99CC66]/60`}
          title={t.sms.badgeDeliveredTitle}
        >
          <CheckCheck className="w-3.5 h-3.5 text-[#254222] shrink-0" />
          <span>{t.sms.badgeDelivered}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#254222] shrink-0" />
        </span>
      );
    }

    if (category === 'Failed') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full font-bold transition-all shadow-2xs ${
            compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
          } bg-[#FDF2F0] text-[#7A1E1F] border border-[#E8B4B8]`}
          title={t.sms.badgeFailedTitle}
        >
          <XCircle className="w-3.5 h-3.5 text-[#9E2A2B] shrink-0" />
          <span>{t.sms.badgeFailed}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#9E2A2B] shrink-0" />
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-bold transition-all shadow-2xs ${
          compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
        } bg-[#F7FAF4] text-[#254222] border border-[#CAE4C5]`}
        title={t.sms.badgeSentTitle}
      >
        <Send className="w-3.5 h-3.5 text-[#5E7F52] shrink-0" />
        <span>{t.sms.badgeSent}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#99CC66] shrink-0" />
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[24px] sm:text-[26px] font-bold text-[#254222] tracking-tight">
              {t.sms.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.sms.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={openSimConfigModal}
            className="px-4 py-2.5 rounded-xl border border-[#99CC66] bg-[#CAE4C5]/50 hover:bg-[#CAE4C5] text-[#254222] font-bold text-[13px] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-[#254222]" />
            <span>{t.sms.simConfigBtn}</span>
          </button>

          <button
            onClick={handleTriggerScheduler}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-[#CAE4C5] bg-white hover:bg-[#F7FAF4] text-[#254222] font-semibold text-[13px] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            title={t.sms.runSchedulerTitle}
          >
            <RefreshCw className={`w-4 h-4 text-[#254222] ${loading ? 'animate-spin' : ''}`} />
            <span>{t.sms.runSchedulerBtn}</span>
          </button>

          <button
            onClick={() => {
              if (activeTab === 'overview' && directCardRef.current) {
                directCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                setIsDirectModalOpen(true);
              }
            }}
            className="bg-[#254222] hover:bg-[#1B3219] text-white px-4 py-2.5 rounded-xl font-semibold text-[13px] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{t.sms.composeSmsBtn}</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-[#FDF2F0] border border-[#E8B4B8] text-[#7A1E1F] text-[13.5px] font-medium flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-[#CAE4C5]/60 border border-[#99CC66] text-[#254222] text-[13.5px] font-medium flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#254222] shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-[#4A6644] hover:text-[#254222] cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mode Badge Banner */}
      <div className="p-4 rounded-2xl bg-white border border-[#CAE4C5] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#CAE4C5] text-[#254222] shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[14px] text-[#254222]">{t.sms.gatewayModeLabel}</span>
              {config.provider_mode === 'PRODUCTION' ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#254222] text-white">
                  {t.sms.badgeProductionActive}
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#ECE2B1] text-[#254222] border border-[#99CC66]/50">
                  {t.sms.badgeTestSimulated}
                </span>
              )}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-[#F7FAF4] text-[#254222] border border-[#CAE4C5]">
                {config.simPlanLabel || t.sms.simPlanBadgeDefault}
              </span>
            </div>
            <p className="text-xs text-[#4A6644] mt-0.5">
              {config.provider_mode === 'PRODUCTION'
                ? config.smsApiUrl && config.api_key_configured
                  ? t.sms.productionReadyDesc
                  : t.sms.productionMissingKeysDesc
                : t.sms.testModeDesc}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={openSimConfigModal}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-[#F7FAF4] hover:bg-[#CAE4C5]/50 text-[#254222] border border-[#CAE4C5] cursor-pointer flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t.sms.simConfigBtn}</span>
          </button>
          <div className="flex items-center gap-2 text-xs text-[#4A6644] bg-[#F7FAF4] px-3 py-2 rounded-xl border border-[#CAE4C5]">
            <Clock className="w-4 h-4 text-[#5E7F52]" />
            <span>
              {t.sms.allowedHoursPrefix}{' '}
              <strong className="text-[#254222]" dir="ltr">
                {config.sending_start_hour}h00 – {config.sending_end_hour}h00
              </strong>{' '}
              {t.sms.algiersTimezoneSuffix}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[#CAE4C5] overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-[#254222] text-white shadow-xs'
              : 'text-[#4A6644] hover:bg-[#CAE4C5]/60 hover:text-[#254222]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>{t.sms.tabOverview}</span>
        </button>

        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'scheduled'
              ? 'bg-[#254222] text-white shadow-xs'
              : 'text-[#4A6644] hover:bg-[#CAE4C5]/60 hover:text-[#254222]'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{t.sms.tabScheduled}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === 'scheduled' ? 'bg-white/20 text-white' : 'bg-[#CAE4C5] text-[#254222]'}`}>
            {reminders.filter((r) => r.status === 'Scheduled').length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'history'
              ? 'bg-[#254222] text-white shadow-xs'
              : 'text-[#4A6644] hover:bg-[#CAE4C5]/60 hover:text-[#254222]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>{t.sms.tabHistory}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-[#CAE4C5] text-[#254222]'}`}>
            {logs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'templates'
              ? 'bg-[#254222] text-white shadow-xs'
              : 'text-[#4A6644] hover:bg-[#CAE4C5]/60 hover:text-[#254222]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{t.sms.tabTemplates}</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-[#254222] text-white shadow-xs'
              : 'text-[#4A6644] hover:bg-[#CAE4C5]/60 hover:text-[#254222]'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>{t.sms.tabSettings}</span>
        </button>
      </div>

      {/* 1. VUE D'ENSEMBLE */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Primary 1-Click Direct SIM SMS Composer Card */}
          <div
            ref={directCardRef}
            id="direct-sms-composer"
            className="bg-white rounded-2xl border-2 border-[#99CC66]/70 shadow-2xs overflow-hidden"
          >
            <div className="px-6 py-4 bg-[#F7FAF4] border-b border-[#CAE4C5] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#99CC66] text-[#254222] shrink-0">
                  <Radio className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-bold text-[17px] text-[#254222]">{t.sms.directSimCardTitle}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#CAE4C5] text-[#254222] border border-[#99CC66]/50">
                      {config.simPlanLabel || t.sms.simPlanBadgeDefault}
                    </span>
                    {config.provider_mode === 'PRODUCTION' ? (
                      config.smsApiUrl ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#254222] text-white">
                          {t.sms.simGatewayReadyBadge}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FDF2F0] text-[#9E2A2B] border border-[#E8B4B8]">
                          {t.sms.simGatewayUnconfiguredBadge}
                        </span>
                      )
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#ECE2B1] text-[#254222]">
                        {t.sms.testModeWord}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#4A6644] mt-0.5">{t.sms.directSimCardSubtitle}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={openSimConfigModal}
                className="px-3.5 py-2 rounded-xl border border-[#CAE4C5] bg-white hover:bg-[#CAE4C5]/40 text-xs font-bold text-[#254222] transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t.sms.simConfigBtn}</span>
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Left / Main 1-Click Direct SIM Form */}
              <div className={`${showQrCode ? 'xl:col-span-8' : 'xl:col-span-12'} space-y-5`}>
                {/* Searchable Client & Pet Selector + Manual Phone with Carrier Detector */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-[#4A6644] flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5" />
                        <span>{t.sms.directSelectClientPetLabel}</span>
                      </label>
                      {(selectedClientId || recipientQuery) && (
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="text-[11px] font-semibold text-[#5E7F52] hover:text-[#254222] cursor-pointer"
                        >
                          {t.sms.directClearSelection}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={recipientQuery}
                      onFocus={() => setIsPickerOpen(true)}
                      onBlur={() => setTimeout(() => setIsPickerOpen(false), 180)}
                      onChange={(e) => {
                        setRecipientQuery(e.target.value);
                        setIsPickerOpen(true);
                      }}
                      placeholder={t.sms.directSearchPlaceholder}
                      className="w-full px-3.5 py-2.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm font-medium text-[#254222] focus:outline-none focus:border-[#254222] focus:bg-white"
                    />
                    {isPickerOpen && (
                      <div className="absolute z-20 mt-1.5 w-full bg-white border border-[#CAE4C5] rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-[#CAE4C5]/60">
                        {filteredDirectory.map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSelectDirectoryEntry(entry);
                            }}
                            className="w-full px-3.5 py-2.5 text-start hover:bg-[#F7FAF4] flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#254222] truncate flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5 text-[#5E7F52] shrink-0" />
                                <span>{entry.clientName}</span>
                                {entry.animalName && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#CAE4C5] text-[#254222] text-[10px] font-semibold">
                                    {entry.species === 'Chien' ? '🐶' : entry.species === 'Chat' ? '🐱' : '🐾'}{' '}
                                    {entry.animalName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span dir="ltr" className="text-xs font-mono text-[#4A6644] tabular-nums shrink-0">
                              {entry.phone}
                            </span>
                          </button>
                        ))}
                        {filteredDirectory.length === 0 && (
                          <div className="px-3.5 py-3 text-xs text-[#4A6644] text-center">
                            {t.sms.directNoClientMatches}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                      <label className="text-xs font-bold text-[#4A6644]">
                        {t.sms.directPhoneLabel}
                      </label>
                      {directPhone.trim() && (
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full tabular-nums ${
                            directPhoneInfo.isValid
                              ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66]/50'
                              : 'bg-[#FDF2F0] text-[#9E2A2B] border border-[#E8B4B8]'
                          }`}
                        >
                          {directPhoneInfo.isValid ? (
                            <>
                              <span
                                className={`w-2 h-2 rounded-full shrink-0 ${
                                  directPhoneInfo.carrier === 'Ooredoo'
                                    ? 'bg-[#ED1C24]'
                                    : directPhoneInfo.carrier === 'Mobilis'
                                    ? 'bg-[#008A3B]'
                                    : directPhoneInfo.carrier === 'Djezzy'
                                    ? 'bg-[#F58220]'
                                    : 'bg-[#254222]'
                                }`}
                              />
                              <span dir="ltr">
                                {directPhoneInfo.carrier === 'Ooredoo'
                                  ? 'Ooredoo (05)'
                                  : directPhoneInfo.carrier === 'Mobilis'
                                  ? 'Mobilis (06)'
                                  : directPhoneInfo.carrier === 'Djezzy'
                                  ? 'Djezzy (07)'
                                  : directPhoneInfo.carrier}{' '}
                                &bull; {directPhoneInfo.e164}
                              </span>
                              {(directPhoneInfo.carrier === 'Ooredoo' ||
                                directPhoneInfo.carrier === 'Mobilis' ||
                                directPhoneInfo.carrier === 'Djezzy') && (
                                <span className="text-[10px] font-semibold text-[#254222]/80">
                                  &bull; {t.sms.carrierUnlimitedSuffix}
                                </span>
                              )}
                            </>
                          ) : (
                            <span>{directPhoneInfo.error}</span>
                          )}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      dir="ltr"
                      value={directPhone}
                      onChange={(e) => setDirectPhone(e.target.value)}
                      placeholder={t.sms.directPhonePlaceholder}
                      className="w-full px-3.5 py-2.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm font-mono font-bold text-[#254222] tabular-nums focus:outline-none focus:border-[#254222] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#4A6644] mb-1">
                      {t.sms.directRecipientNameLabel}
                    </label>
                    <input
                      type="text"
                      value={directOwnerName}
                      onChange={(e) => setDirectOwnerName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222] focus:outline-none focus:border-[#254222] focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4A6644] mb-1">
                      {t.sms.directAnimalNameLabel}
                    </label>
                    <input
                      type="text"
                      value={directAnimalName}
                      onChange={(e) => setDirectAnimalName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222] focus:outline-none focus:border-[#254222] focus:bg-white"
                    />
                  </div>
                </div>

                {/* One-click Clinical Templates (FR / EN / AR) */}
                <div>
                  <span className="block text-xs font-bold text-[#4A6644] mb-2">
                    {t.sms.directQuickTemplatesLabel}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: 'appointment', label: t.sms.tplApptLabel },
                        { id: 'vaccination', label: t.sms.tplVaccineLabel },
                        { id: 'pickup', label: t.sms.tplPickupLabel },
                        { id: 'followup', label: t.sms.tplResultsLabel },
                        { id: 'custom', label: t.sms.tplCustomLabel },
                      ] as Array<{ id: DirectTemplateKey; label: string }>
                    ).map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyDirectTemplate(tpl.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                          activeDirectTemplate === tpl.id
                            ? 'bg-[#254222] text-white border-[#254222] shadow-2xs'
                            : 'bg-[#F7FAF4] text-[#254222] border-[#CAE4C5] hover:bg-[#CAE4C5]/50'
                        }`}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Textarea + Live GSM-7 / UCS-2 Segment Counter */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <label className="text-xs font-bold text-[#4A6644]">{t.sms.directMsgLabel}</label>
                    <div className="flex items-center gap-2 text-xs tabular-nums" dir="ltr">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold ${
                          directCalc.containsUnicode
                            ? 'bg-[#ECE2B1] text-[#254222]'
                            : 'bg-[#CAE4C5] text-[#254222]'
                        }`}
                      >
                        {directCalc.containsUnicode ? t.sms.formatUnicodeLabel : t.sms.formatStandardLabel}
                      </span>
                      <span className="text-[#4A6644] font-semibold">
                        {directCalc.characterCount} {t.sms.charsWord}
                      </span>
                      <span className="font-bold text-[#254222]">
                        {directCalc.segmentCount} {t.sms.messagesWord}
                      </span>
                      <span className="text-[#5E7F52] text-[11px]">
                        ({directCalc.remainingInCurrentSegment}/{directCalc.maxPerSegment})
                      </span>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={directMessage}
                    onChange={(e) => setDirectMessage(e.target.value)}
                    placeholder={t.sms.directMsgPlaceholder}
                    className="w-full p-3.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm text-[#254222] leading-relaxed focus:outline-none focus:border-[#254222] focus:bg-white"
                  />
                </div>

                {/* Primary 1-Click SIM Action + Optional iPhone / QR Fallback */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1 flex-wrap">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={!directPhoneInfo.isValid || !directMessage.trim() || isSendingDirectMethod !== null}
                      onClick={() => handleSendDirectSms('gateway')}
                      className="px-5 py-3 rounded-xl bg-[#254222] hover:bg-[#1B3219] text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      <span>
                        {isSendingDirectMethod === 'gateway'
                          ? t.sms.directSendingBtn
                          : t.sms.directSendNowPrimaryBtn}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFallbackIphone((prev) => !prev)}
                      className="px-3 py-2.5 rounded-xl border border-[#CAE4C5] bg-[#F7FAF4] hover:bg-[#CAE4C5]/40 text-[#4A6644] text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>{t.sms.simFallbackToggleBtn}</span>
                    </button>
                  </div>

                  {showFallbackIphone && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
                      <button
                        type="button"
                        disabled={!directPhoneInfo.isValid || !directMessage.trim() || isSendingDirectMethod !== null}
                        onClick={() => handleSendDirectSms('iphone_bridge')}
                        className="px-3.5 py-2 rounded-xl bg-[#99CC66] hover:bg-[#88BC55] text-[#254222] font-bold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        <Smartphone className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isSendingDirectMethod === 'iphone_bridge'
                            ? t.sms.directSendingBtn
                            : t.sms.directSendIphoneBtn}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowQrCode((prev) => !prev)}
                        disabled={!directSmsUri}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${
                          showQrCode
                            ? 'bg-[#254222] text-white border-[#254222]'
                            : 'bg-white text-[#254222] border-[#CAE4C5] hover:bg-[#CAE4C5]/40'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>{showQrCode ? t.sms.directQrHideBtn : t.sms.directQrShowBtn}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right / Toggleable iPhone QR Code Panel */}
              {showQrCode && directSmsUri && (
                <div className="xl:col-span-4 bg-[#F7FAF4] rounded-2xl border border-[#CAE4C5] p-5 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="bg-white p-3.5 rounded-2xl border border-[#CAE4C5] shadow-2xs">
                    <QRCodeSVG
                      value={directSmsUri}
                      size={156}
                      bgColor="#FFFFFF"
                      fgColor="#254222"
                      level="M"
                    />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-[#254222]">{t.sms.directQrTitle}</h3>
                    <p className="text-xs text-[#4A6644] leading-relaxed">{t.sms.directQrDesc}</p>
                  </div>
                  <a
                    href={directSmsUri}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#CAE4C5] hover:bg-[#CAE4C5]/40 text-xs font-bold text-[#254222]"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>{t.sms.directQrOpenUriBtn}</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#CAE4C5] shadow-2xs">
              <span className="text-[13px] font-medium text-[#4A6644]">{t.sms.kpiProcessedSms}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-[#254222]">{logs.length}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#CAE4C5] text-[#254222]">
                  {t.sms.kpiTotalToDate}
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#CAE4C5] shadow-2xs">
              <span className="text-[13px] font-medium text-[#4A6644]">{t.sms.kpiPendingReminders}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-[#254222]">
                  {reminders.filter((r) => r.status === 'Scheduled').length}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#ECE2B1] text-[#254222] border border-[#99CC66]/40">
                  {t.sms.kpiIdempotentQueue}
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#CAE4C5] shadow-2xs">
              <span className="text-[13px] font-medium text-[#4A6644]">{t.sms.kpiSuccessRate}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-3xl font-extrabold text-[#254222]">
                  {deliverabilityRate === null ? '—' : `${deliverabilityRate}%`}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#CAE4C5] text-[#254222]">
                  {countFailed} {countFailed > 1 ? t.sms.kpiFailurePlural : t.sms.kpiFailureSingular}
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#CAE4C5] shadow-2xs">
              <span className="text-[13px] font-medium text-[#4A6644]">{t.sms.kpiActiveGateway}</span>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-xl font-bold text-[#254222] truncate">
                  {config.provider_mode === 'PRODUCTION' ? t.sms.realApiWord : t.sms.simulatorWord}
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#CAE4C5] text-[#254222]">
                  {config.provider_mode === 'PRODUCTION' ? t.sms.productionWord : t.sms.testModeWord}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
              <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-[#254222]" />
                <span>{t.sms.carriersTitle}</span>
              </h2>
              <p className="text-xs text-[#4A6644]">
                {t.sms.carriersSubtitle}
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-[#254222] mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ED1C24]" />
                      Ooredoo (05xx) — {carrierCounts.Ooredoo}
                    </span>
                    <span>{carrierPct.Ooredoo}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#F7FAF4] rounded-full overflow-hidden border border-[#CAE4C5]">
                    <div className="h-full bg-[#ED1C24] rounded-full" style={{ width: `${carrierPct.Ooredoo}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-[#254222] mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#008A3B]" />
                      Mobilis (06xx) — {carrierCounts.Mobilis}
                    </span>
                    <span>{carrierPct.Mobilis}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#F7FAF4] rounded-full overflow-hidden border border-[#CAE4C5]">
                    <div className="h-full bg-[#008A3B] rounded-full" style={{ width: `${carrierPct.Mobilis}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-[#254222] mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F58220]" />
                      Djezzy (07xx) — {carrierCounts.Djezzy}
                    </span>
                    <span>{carrierPct.Djezzy}%</span>
                  </div>
                  <div className="w-full h-2 bg-[#F7FAF4] rounded-full overflow-hidden border border-[#CAE4C5]">
                    <div className="h-full bg-[#F58220] rounded-full" style={{ width: `${carrierPct.Djezzy}%` }} />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#CAE4C5] text-[11px] text-[#4A6644] flex items-center gap-1.5">
                <Info className="w-4 h-4 text-[#5E7F52] shrink-0" />
                <span>{t.sms.e164Note}</span>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#254222]" />
                  <span>{t.sms.upcomingRemindersTitle}</span>
                </h2>
                <button
                  onClick={() => setActiveTab('scheduled')}
                  className="text-xs font-bold text-[#5E7F52] hover:underline cursor-pointer"
                >
                  {t.sms.viewAllQueueLink} &rarr;
                </button>
              </div>

              <div className="divide-y divide-[#CAE4C5]">
                {reminders.slice(0, 4).map((rem) => (
                  <div key={rem.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#254222]">{rem.owner_name}</span>
                        <span className="text-xs text-[#4A6644]">({rem.animal_name})</span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-[#CAE4C5] text-[#254222] font-medium">
                          {rem.reminder_type}
                        </span>
                      </div>
                      <p className="text-xs text-[#4A6644]">
                        {t.sms.numberPrefix}{' '}
                        <strong className="text-[#254222]" dir="ltr">
                          {rem.owner_phone}
                        </strong>{' '}
                        &bull; {t.sms.scheduledPrefix} {formatLocalizedDate(rem.scheduled_at, language)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                          rem.status === 'Sent' || rem.status === 'Delivered'
                            ? 'bg-[#CAE4C5] text-[#254222]'
                            : rem.status === 'Failed'
                            ? 'bg-[#FDF2F0] text-[#9E2A2B]'
                            : 'bg-[#ECE2B1] text-[#254222] border border-[#99CC66]/40'
                        }`}
                      >
                        {translateReminderStatus(rem.status)}
                      </span>
                      {rem.status === 'Scheduled' && (
                        <>
                          <button
                            onClick={() => handleSendReminderNow(rem)}
                            disabled={sendingReminderId === rem.id}
                            className="px-3 py-1 bg-[#254222] hover:bg-[#1B3219] text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs inline-flex items-center gap-1.5 disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{t.sms.sendNowBtn}</span>
                          </button>
                          <button
                            onClick={() => handleSendReminderViaIphone(rem)}
                            disabled={sendingReminderId === rem.id}
                            title={t.sms.sendViaIphoneBtn}
                            className="px-2.5 py-1 bg-[#F7FAF4] hover:bg-[#CAE4C5]/50 text-[#254222] border border-[#CAE4C5] rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>iPhone</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {reminders.length === 0 && (
                  <p className="py-6 text-center text-xs text-[#4A6644]">
                    {t.sms.emptyQueue}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. RAPPELS PLANIFIÉS */}
      {activeTab === 'scheduled' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-[#CAE4C5] shadow-2xs flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#4A6644]">{t.sms.filterByStatusLabel}</span>
              {(['ALL', 'Scheduled', 'Sent', 'Failed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setReminderFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    reminderFilter === f
                      ? 'bg-[#254222] text-white'
                      : 'bg-[#F7FAF4] text-[#4A6644] hover:bg-[#CAE4C5]/60'
                  }`}
                >
                  {f === 'ALL'
                    ? `${t.sms.filterAllCount} (${reminders.length})`
                    : f === 'Scheduled'
                    ? `${t.sms.filterPendingCount} (${reminders.filter((r) => r.status === 'Scheduled').length})`
                    : f === 'Sent'
                    ? `${t.sms.filterSentCount} (${reminders.filter((r) => r.status === 'Sent' || r.status === 'Delivered').length})`
                    : `${t.sms.filterFailedCount} (${reminders.filter((r) => r.status === 'Failed').length})`}
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsDirectModalOpen(true)}
              className="bg-[#254222] hover:bg-[#1B3219] text-white px-3.5 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.sms.sendManualSmsBtn}</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="bg-[#F7FAF4] border-b border-[#CAE4C5] text-[12px] font-bold text-[#4A6644] uppercase tracking-wider">
                    <th className="py-3 px-4 text-start">{t.sms.colRecipient}</th>
                    <th className="py-3 px-4 text-start">{t.sms.colAnimal}</th>
                    <th className="py-3 px-4 text-start">{t.sms.colReminderType}</th>
                    <th className="py-3 px-4 text-start">{t.sms.colScheduledDate}</th>
                    <th className="py-3 px-4 text-start">{t.sms.colStatus}</th>
                    <th className="py-3 px-4 text-end">{t.sms.colActions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CAE4C5] text-[13px]">
                  {filteredReminders.map((r) => {
                    const phoneData = formatAlgerianPhone(r.owner_phone || r.phone_normalized || '');
                    return (
                      <tr key={r.id} className="hover:bg-[#F7FAF4]/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#254222]">{r.owner_name}</div>
                          <div className="text-xs text-[#4A6644] flex items-center gap-1.5 mt-0.5">
                            <span dir="ltr">{r.owner_phone}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-[#CAE4C5] text-[#254222]">
                              {phoneData.carrier}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#254222] flex items-center gap-1.5">
                            <span>{r.species === 'Chien' ? '🐶' : '🐱'}</span>
                            <span>{r.animal_name}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md font-semibold text-xs bg-[#CAE4C5] text-[#254222] border border-[#99CC66]/40">
                            {r.reminder_type}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-[#4A6644]">
                          {new Date(r.scheduled_at).toLocaleString(locale, {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              r.status === 'Sent' || r.status === 'Delivered'
                                ? 'bg-[#CAE4C5] text-[#254222]'
                                : r.status === 'Scheduled'
                                ? 'bg-[#ECE2B1] text-[#254222]'
                                : 'bg-red-50 text-red-600'
                            }`}
                          >
                            {(r.status === 'Sent' || r.status === 'Delivered') && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {r.status === 'Scheduled' && <Clock className="w-3.5 h-3.5" />}
                            {translateReminderStatus(r.status)}
                          </span>
                          {r.last_error && <div className="text-[11px] text-red-600 mt-0.5">{r.last_error}</div>}
                        </td>

                        <td className="py-3 px-4 text-end">
                          <div className="flex items-center justify-end gap-2">
                            {r.status === 'Scheduled' && (
                              <>
                                <button
                                  onClick={() => handleSendReminderNow(r)}
                                  disabled={sendingReminderId === r.id}
                                  className="px-3 py-1 bg-[#254222] hover:bg-[#1B3219] text-white rounded-lg text-xs font-bold cursor-pointer shadow-2xs inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>{t.sms.sendNowBtn}</span>
                                </button>
                                <button
                                  onClick={() => handleSendReminderViaIphone(r)}
                                  disabled={sendingReminderId === r.id}
                                  title={t.sms.sendViaIphoneBtn}
                                  className="px-2.5 py-1 bg-[#F7FAF4] hover:bg-[#CAE4C5]/50 text-[#254222] border border-[#CAE4C5] rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                  <Smartphone className="w-3.5 h-3.5" />
                                  <span>iPhone</span>
                                </button>
                                <button
                                  onClick={() => handleCancelReminder(r.id)}
                                  className="px-2 py-1 bg-[#F7FAF4] hover:bg-[#FDF2F0] text-[#9E2A2B] border border-[#CAE4C5] rounded-lg text-xs font-medium cursor-pointer"
                                >
                                  {t.sms.cancelBtn}
                                </button>
                              </>
                            )}
                            {r.status === 'Failed' && (
                              <button
                                onClick={() => handleRetryReminder(r.id)}
                                className="px-2.5 py-1 bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>{t.sms.retryBtn}</span>
                              </button>
                            )}
                            {(r.status === 'Sent' || r.status === 'Delivered') && (
                              <span className="text-xs text-[#5E7F52] italic">
                                {r.is_simulated ? t.sms.deliveredSimulated : t.sms.transmittedWord}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredReminders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#4A6644] text-xs">
                        {t.sms.noFilteredReminders}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. HISTORIQUE SMS */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setLogStatusFilter('ALL')}
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                logStatusFilter === 'ALL'
                  ? 'bg-white border-[#254222] shadow-xs ring-2 ring-[#254222]/20'
                  : 'bg-white/80 border-[#CAE4C5] hover:bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#4A6644]">{t.sms.histAllArchived}</span>
                <History className="w-4 h-4 text-[#5E7F52]" />
              </div>
              <div className="mt-1 text-2xl font-bold text-[#254222]">{logs.length}</div>
              <div className="text-[11px] text-[#4A6644] mt-0.5">{t.sms.histAllStreams}</div>
            </button>

            <button
              type="button"
              onClick={() => setLogStatusFilter('Delivered')}
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                logStatusFilter === 'Delivered'
                  ? 'bg-[#CAE4C5]/55 border-[#254222] shadow-xs ring-2 ring-[#254222]/20'
                  : 'bg-white/80 border-[#CAE4C5] hover:bg-[#CAE4C5]/35'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#254222]">{t.sms.histDelivered}</span>
                <CheckCheck className="w-4 h-4 text-[#254222]" />
              </div>
              <div className="mt-1 text-2xl font-bold text-[#254222]">{countDelivered}</div>
              <div className="text-[11px] text-[#4A6644] font-medium mt-0.5">{t.sms.histReceiptsConfirmed}</div>
            </button>

            <button
              type="button"
              onClick={() => setLogStatusFilter('Sent')}
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                logStatusFilter === 'Sent'
                  ? 'bg-[#F7FAF4] border-[#254222] shadow-xs ring-2 ring-[#254222]/20'
                  : 'bg-white/80 border-[#CAE4C5] hover:bg-[#F7FAF4]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#254222]">{t.sms.histSent}</span>
                <Send className="w-4 h-4 text-[#5E7F52]" />
              </div>
              <div className="mt-1 text-2xl font-bold text-[#254222]">{countSent}</div>
              <div className="text-[11px] text-[#4A6644] mt-0.5">{t.sms.histInTransit}</div>
            </button>

            <button
              type="button"
              onClick={() => setLogStatusFilter('Failed')}
              className={`p-3.5 rounded-2xl border text-start transition-all cursor-pointer ${
                logStatusFilter === 'Failed'
                  ? 'bg-[#FDF2F0] border-[#9E2A2B] shadow-xs ring-2 ring-[#9E2A2B]/20'
                  : 'bg-white/80 border-[#CAE4C5] hover:bg-[#FDF2F0]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#7A1E1F]">{t.sms.histFailed}</span>
                <XCircle className="w-4 h-4 text-[#9E2A2B]" />
              </div>
              <div className="mt-1 text-2xl font-bold text-[#9E2A2B]">{countFailed}</div>
              <div className="text-[11px] text-[#7A1E1F] mt-0.5">{t.sms.histUndelivered}</div>
            </button>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#CAE4C5] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                placeholder={t.sms.histSearchPlaceholder}
                className="w-full px-4 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm focus:outline-none focus:border-[#254222] focus:bg-white text-[#254222]"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setLogStatusFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  logStatusFilter === 'ALL'
                    ? 'bg-[#254222] text-white shadow-2xs'
                    : 'bg-[#F7FAF4] text-[#4A6644] hover:bg-[#CAE4C5]/60 border border-[#CAE4C5]'
                }`}
              >
                {t.sms.histAllFilter} ({logs.length})
              </button>
              <button
                type="button"
                onClick={() => setLogStatusFilter('Delivered')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  logStatusFilter === 'Delivered'
                    ? 'bg-[#CAE4C5] text-[#254222] border border-[#254222] ring-2 ring-[#254222]/20 shadow-2xs'
                    : 'bg-[#F7FAF4] text-[#254222] hover:bg-[#CAE4C5]/60 border border-[#CAE4C5]'
                }`}
              >
                <CheckCheck className="w-3.5 h-3.5 text-[#254222]" />
                <span>{t.sms.histDeliveredFilter} ({countDelivered})</span>
              </button>
              <button
                type="button"
                onClick={() => setLogStatusFilter('Sent')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  logStatusFilter === 'Sent'
                    ? 'bg-[#F7FAF4] text-[#254222] border border-[#254222] ring-2 ring-[#254222]/20 shadow-2xs'
                    : 'bg-[#F7FAF4] text-[#4A6644] hover:bg-[#CAE4C5]/60 border border-[#CAE4C5]'
                }`}
              >
                <Send className="w-3.5 h-3.5 text-[#5E7F52]" />
                <span>{t.sms.histSentFilter} ({countSent})</span>
              </button>
              <button
                type="button"
                onClick={() => setLogStatusFilter('Failed')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  logStatusFilter === 'Failed'
                    ? 'bg-[#FDF2F0] text-[#7A1E1F] border border-[#9E2A2B] ring-2 ring-[#9E2A2B]/20 shadow-2xs'
                    : 'bg-[#F7FAF4] text-[#4A6644] hover:bg-[#FDF2F0] border border-[#CAE4C5]'
                }`}
              >
                <XCircle className="w-3.5 h-3.5 text-[#9E2A2B]" />
                <span>{t.sms.histFailedFilter} ({countFailed})</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-hidden divide-y divide-[#CAE4C5]">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-[#F7FAF4]/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 flex-1 min-w-0 pe-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[14px] text-[#254222]">{log.recipient_name}</span>
                    <span dir="ltr" className="text-xs font-mono text-[#4A6644] bg-[#F7FAF4] px-2 py-0.5 rounded border border-[#CAE4C5]">
                      {log.recipient_phone}
                    </span>
                    {log.animal_name && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[#CAE4C5] text-[#254222] font-medium">
                        {t.sms.patientPrefix} {log.animal_name}
                      </span>
                    )}
                    <span className="text-[11px] text-[#5E7F52]">
                      {new Date(log.created_at).toLocaleString(locale)}
                    </span>
                  </div>

                  <p className="text-[13px] text-[#254222] bg-[#F7FAF4] p-2.5 rounded-xl border border-[#CAE4C5] font-mono leading-relaxed">
                    {log.message_content}
                  </p>

                  <div className="flex items-center gap-3 text-xs text-[#4A6644] flex-wrap">
                    <span>
                      {t.sms.formatPrefix}{' '}
                      <strong className="text-[#254222]">
                        {log.encoding?.toUpperCase().includes('GSM')
                          ? t.sms.formatStandardLabel
                          : t.sms.formatUnicodeLabel}
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span>{t.sms.segmentsPrefix} <strong className="text-[#5E7F52]">{log.segment_count} {t.sms.messagesWord}</strong></span>
                    {log.category && (
                      <>
                        <span>&bull;</span>
                        <span className="text-[11px] px-2 py-0.2 rounded bg-[#CAE4C5] text-[#254222] font-medium">
                          {log.category}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex md:flex-col items-center md:items-end justify-between gap-2.5 shrink-0">
                  {renderLogStatusBadge(log.status)}
                  {log.provider_response && (
                    <button
                      onClick={() => setSelectedLogPayload(log)}
                      className="text-xs text-[#5E7F52] hover:underline cursor-pointer font-medium"
                    >
                      {t.sms.payloadDetailsBtn} &rarr;
                    </button>
                  )}
                </div>
              </div>
            ))}

            {filteredLogs.length === 0 && (
              <div className="p-8 text-center text-[#4A6644] text-xs">
                {t.sms.noFilteredLogs}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. MODÈLES DE MESSAGES */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
            <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#254222]" />
              <span>{t.sms.savedTemplatesTitle}</span>
            </h2>

            <div className="space-y-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    setTemplateTitle(tpl.title);
                    setTemplateContent(tpl.content);
                    setTemplateCategory(tpl.category);
                  }}
                  className={`p-3 rounded-xl border text-start cursor-pointer transition-all ${
                    selectedTemplate?.id === tpl.id
                      ? 'bg-[#CAE4C5]/60 border-[#254222] shadow-2xs'
                      : 'border-[#CAE4C5] hover:bg-[#F7FAF4]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-[#254222] truncate">{tpl.title}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white text-[#254222] border border-[#CAE4C5] shrink-0">
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-xs text-[#4A6644] line-clamp-2 mt-1">{tpl.content}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                setSelectedTemplate(null);
                setTemplateTitle(t.sms.newTemplateDefaultTitle);
                setTemplateContent(t.sms.newTemplateDefaultContent);
                setTemplateCategory('VACCINATION');
              }}
              className="w-full py-2 border border-dashed border-[#99CC66] hover:bg-[#F7FAF4] text-[#254222] rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.sms.createTemplateBtn}</span>
            </button>
          </div>

          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#254222]" />
                <span>{t.sms.templateEditorTitle}</span>
              </h2>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#4A6644]">{t.sms.categoryLabel}</span>
                <select
                  value={templateCategory}
                  onChange={(e) => setTemplateCategory(e.target.value as any)}
                  className="px-3 py-1.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-lg text-xs font-bold text-[#254222]"
                >
                  <option value="VACCINATION">{t.sms.catVaccination}</option>
                  <option value="APPOINTMENT">{t.sms.catAppointment}</option>
                  <option value="POST_OP">{t.sms.catPostOp}</option>
                  <option value="URGENCE">{t.sms.catUrgence}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1">{t.sms.templateTitleLabel}</label>
              <input
                type="text"
                value={templateTitle}
                onChange={(e) => setTemplateTitle(e.target.value)}
                className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm font-semibold text-[#254222]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1.5">
                {t.sms.dynamicTagsLabel}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['{proprietaire}', '{animal}', '{date}', '{heure}', '{vaccin}', '{cabinet}', '{telephone_cabinet}'].map(
                  (tag) => (
                    <button
                      key={tag}
                      type="button"
                      dir="ltr"
                      onClick={() => handleInsertTag(tag)}
                      className="px-2.5 py-1 rounded-lg bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] text-xs font-mono font-semibold transition-colors cursor-pointer border border-[#CAE4C5]"
                    >
                      + {tag}
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-[#4A6644]">{t.sms.smsTextLabel}</label>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-bold ${templateCalc.containsUnicode ? 'text-amber-600' : 'text-[#5E7F52]'}`}>
                    {templateCalc.containsUnicode ? t.sms.formatUnicodeLabel : t.sms.formatStandardLabel}
                  </span>
                  <span>&bull;</span>
                  <span>{templateCalc.characterCount} {t.sms.charsWord}</span>
                  <span>&bull;</span>
                  <span className="font-bold text-[#254222]">{templateCalc.segmentCount} {t.sms.messagesWord}</span>
                </div>
              </div>

              <textarea
                value={templateContent}
                onChange={(e) => setTemplateContent(e.target.value)}
                rows={4}
                className="w-full p-3 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm font-mono focus:outline-none focus:border-[#254222] focus:bg-white text-[#254222]"
              />

              <div className="flex items-center justify-between mt-1 text-xs text-[#4A6644] gap-2 flex-wrap">
                <span>
                  {t.sms.remainingInSegmentPrefix} <strong>{templateCalc.remainingInCurrentSegment}</strong>
                </span>
                {templateCalc.containsUnicode && (
                  <span className="text-amber-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t.sms.nonGsmWarning}
                  </span>
                )}
              </div>
            </div>

            <div className="bg-[#F7FAF4] p-4 rounded-xl border border-[#CAE4C5] space-y-2">
              <span className="text-xs font-bold text-[#4A6644] uppercase tracking-wider">
                {t.sms.previewLabel}
              </span>
              <p className="text-xs text-[#254222] font-mono leading-relaxed bg-white p-3 rounded-lg border border-[#CAE4C5]">
                {templateContent
                  .replace(/{proprietaire}/gi, 'Fatima Fatima')
                  .replace(/{animal}/gi, 'Nina')
                  .replace(/{date}/gi, '14/08/2026')
                  .replace(/{heure}/gi, '09:00')
                  .replace(/{vaccin}/gi, 'Vaccination annuelle')
                  .replace(/{cabinet}/gi, 'Cabinet My Vet')
                  .replace(/{telephone_cabinet}/gi, '0797 63 87 04')}
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition-colors cursor-pointer shadow-xs"
              >
                {t.sms.saveTemplateBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. PARAMÈTRES & ABONNEMENT */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveConfig} className="space-y-6 max-w-4xl">
          <div className="bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
            <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-[#254222]" />
              <span>{t.sms.telecomGatewayTitle}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: 'Ooredoo_Business_Algeria',
                  name: t.sms.provOoredooName,
                  tag: t.sms.provOoredooTag,
                  desc: t.sms.provOoredooDesc,
                },
                {
                  id: 'Mobilis_Entreprise',
                  name: t.sms.provMobilisName,
                  tag: t.sms.provMobilisTag,
                  desc: t.sms.provMobilisDesc,
                },
                {
                  id: 'Djezzy_Enterprise',
                  name: t.sms.provDjezzyName,
                  tag: t.sms.provDjezzyTag,
                  desc: t.sms.provDjezzyDesc,
                },
                {
                  id: 'Simulateur_MyVet',
                  name: t.sms.provSimName,
                  tag: t.sms.provSimTag,
                  desc: t.sms.provSimDesc,
                },
              ].map((prov) => (
                <label
                  key={prov.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                    config.active_provider === prov.id
                      ? 'bg-[#CAE4C5]/60 border-[#254222] shadow-2xs'
                      : 'border-[#CAE4C5] hover:bg-[#F7FAF4]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#254222]">{prov.name}</span>
                    <input
                      type="radio"
                      name="active_provider"
                      checked={config.active_provider === prov.id}
                      onChange={() => setConfig({ ...config, active_provider: prov.id })}
                      className="accent-[#254222]"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-[#5E7F52] mt-1">{prov.tag}</span>
                  <p className="text-xs text-[#4A6644] mt-2">{prov.desc}</p>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#254222]" />
                <span>{t.sms.execModeTitle}</span>
              </h2>
              <button
                type="button"
                onClick={openSimConfigModal}
                className="px-3.5 py-2 rounded-xl bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t.sms.simConfigBtn}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-[#254222] cursor-pointer">
                <input
                  type="radio"
                  name="provider_mode"
                  value="TEST"
                  checked={config.provider_mode === 'TEST'}
                  onChange={() => setConfig({ ...config, provider_mode: 'TEST', smsProviderMode: 'test' })}
                  className="accent-[#254222]"
                />
                <span>{t.sms.simModeTestRadio}</span>
              </label>

              <label className="flex items-center gap-2 text-sm font-semibold text-[#254222] cursor-pointer">
                <input
                  type="radio"
                  name="provider_mode"
                  value="PRODUCTION"
                  checked={config.provider_mode === 'PRODUCTION'}
                  onChange={() => setConfig({ ...config, provider_mode: 'PRODUCTION', smsProviderMode: 'live' })}
                  className="accent-[#254222]"
                />
                <span>{t.sms.simModeLiveRadio}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#CAE4C5]/70">
              <div>
                <label className="block text-xs font-bold text-[#4A6644] mb-1">
                  {t.sms.simPlanLabelField}
                </label>
                <input
                  type="text"
                  value={config.simPlanLabel || ''}
                  onChange={(e) => setConfig({ ...config, simPlanLabel: e.target.value })}
                  placeholder={t.sms.simPlanPlaceholder}
                  className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#4A6644] mb-1">
                  {t.sms.simSenderIdLabel}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={config.smsSenderId || 'MyVet'}
                  onChange={(e) => setConfig({ ...config, smsSenderId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222]"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
            <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#254222]" />
              <span>{t.sms.allowedWindowTitle}</span>
            </h2>
            <p className="text-xs text-[#4A6644]">
              {t.sms.allowedWindowDesc}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#4A6644] mb-1">{t.sms.startHourLabel}</label>
                <input
                  type="number"
                  dir="ltr"
                  min={6}
                  max={12}
                  value={config.sending_start_hour}
                  onChange={(e) => setConfig({ ...config, sending_start_hour: parseInt(e.target.value, 10) || 8 })}
                  className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm font-bold text-[#254222]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#4A6644] mb-1">{t.sms.endHourLabel}</label>
                <input
                  type="number"
                  dir="ltr"
                  min={18}
                  max={23}
                  value={config.sending_end_hour}
                  onChange={(e) => setConfig({ ...config, sending_end_hour: parseInt(e.target.value, 10) || 20 })}
                  className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-sm font-bold text-[#254222]"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-[#CAE4C5] shadow-2xs space-y-4">
            <h2 className="font-bold text-[16px] text-[#254222] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#254222]" />
              <span>{t.sms.autoRulesTitle}</span>
            </h2>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enable_vaccination_reminders}
                  onChange={(e) => setConfig({ ...config, enable_vaccination_reminders: e.target.checked })}
                  className="w-4 h-4 accent-[#254222] rounded"
                />
                <span className="text-sm font-semibold text-[#254222]">
                  {t.sms.ruleVaccinesPrefix} ({config.vaccination_intervals || '7,3,1'} {t.sms.ruleVaccinesSuffix})
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enable_appointment_reminders}
                  onChange={(e) => setConfig({ ...config, enable_appointment_reminders: e.target.checked })}
                  className="w-4 h-4 accent-[#254222] rounded"
                />
                <span className="text-sm font-semibold text-[#254222]">
                  {t.sms.ruleAptsPrefix} {config.appointment_interval_hours || 24} {t.sms.ruleAptsSuffix}
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-[#254222] hover:bg-[#1B3219] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-xs"
            >
              {t.sms.saveSettingsBtn}
            </button>
          </div>
        </form>
      )}

      {/* Direct SMS Modal (Triggered from Scheduled Tab / Secondary Tabs) */}
      <Modal
        isOpen={isDirectModalOpen}
        onClose={() => setIsDirectModalOpen(false)}
        title={t.sms.directCardTitle}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1">
                {t.sms.directRecipientNameLabel}
              </label>
              <input
                type="text"
                value={directOwnerName}
                onChange={(e) => setDirectOwnerName(e.target.value)}
                className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1">
                {t.sms.directPhoneLabel}
              </label>
              <input
                type="text"
                dir="ltr"
                value={directPhone}
                onChange={(e) => setDirectPhone(e.target.value)}
                className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222] font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#4A6644] mb-1">
              {t.sms.directAnimalNameLabel}
            </label>
            <input
              type="text"
              value={directAnimalName}
              onChange={(e) => setDirectAnimalName(e.target.value)}
              className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'appointment', label: t.sms.tplApptLabel },
                { id: 'vaccination', label: t.sms.tplVaccineLabel },
                { id: 'pickup', label: t.sms.tplPickupLabel },
                { id: 'followup', label: t.sms.tplResultsLabel },
                { id: 'custom', label: t.sms.tplCustomLabel },
              ] as Array<{ id: DirectTemplateKey; label: string }>
            ).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => handleApplyDirectTemplate(tpl.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                  activeDirectTemplate === tpl.id
                    ? 'bg-[#254222] text-white border-[#254222]'
                    : 'bg-[#F7FAF4] text-[#254222] border-[#CAE4C5]'
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-[#4A6644]">{t.sms.directMsgLabel}</label>
              <span className="text-xs font-semibold text-[#5E7F52] tabular-nums" dir="ltr">
                {directCalc.encoding} &bull; {directCalc.characterCount} ({directCalc.segmentCount} SMS)
              </span>
            </div>
            <textarea
              required
              rows={4}
              value={directMessage}
              onChange={(e) => setDirectMessage(e.target.value)}
              className="w-full p-3 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs text-[#254222]"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDirectModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={!directPhoneInfo.isValid || !directMessage.trim() || isSendingDirectMethod !== null}
              onClick={() => handleSendDirectSms('iphone_bridge')}
              className="px-4 py-2 bg-[#99CC66] hover:bg-[#88BC55] text-[#254222] rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{t.sms.directSendIphoneBtn}</span>
            </button>
            <button
              type="button"
              disabled={!directPhoneInfo.isValid || !directMessage.trim() || isSendingDirectMethod !== null}
              onClick={() => handleSendDirectSms('gateway')}
              className="px-4 py-2 bg-[#254222] hover:bg-[#1B3219] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSendingDirectMethod === 'gateway'
                  ? t.sms.directSendingBtn
                  : t.sms.directSendNowPrimaryBtn}
              </span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Configure SIM / SMS Gateway Modal */}
      <Modal
        isOpen={isSimConfigModalOpen}
        onClose={() => setIsSimConfigModalOpen(false)}
        title={t.sms.simGatewayConfigModalTitle}
      >
        <form onSubmit={handleSaveSimGatewayModal} className="space-y-4">
          {simModalFeedback && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 border ${
                simModalFeedback.type === 'success'
                  ? 'bg-[#CAE4C5]/60 border-[#99CC66] text-[#254222]'
                  : 'bg-[#FDF2F0] border-[#E8B4B8] text-[#7A1E1F]'
              }`}
            >
              {simModalFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{simModalFeedback.text}</span>
            </div>
          )}

          {/* Mode Toggle: Mode Test vs Mode Direct (Carte SIM Ooredoo / Passerelle) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#4A6644]">{t.sms.simModeLabel}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  simForm.smsProviderMode === 'test'
                    ? 'bg-[#ECE2B1]/60 border-[#254222] shadow-2xs'
                    : 'bg-[#F7FAF4] border-[#CAE4C5]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sim_modal_mode"
                    checked={simForm.smsProviderMode === 'test'}
                    onChange={() => setSimForm({ ...simForm, smsProviderMode: 'test' })}
                    className="accent-[#254222]"
                  />
                  <span className="text-xs font-bold text-[#254222]">{t.sms.simModeTestRadio}</span>
                </div>
                <p className="text-[11px] text-[#4A6644] mt-1">{t.sms.simModeTestHint}</p>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  simForm.smsProviderMode === 'live'
                    ? 'bg-[#CAE4C5]/60 border-[#254222] shadow-2xs'
                    : 'bg-[#F7FAF4] border-[#CAE4C5]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sim_modal_mode"
                    checked={simForm.smsProviderMode === 'live'}
                    onChange={() => setSimForm({ ...simForm, smsProviderMode: 'live' })}
                    className="accent-[#254222]"
                  />
                  <span className="text-xs font-bold text-[#254222]">{t.sms.simModeLiveRadio}</span>
                </div>
                <p className="text-[11px] text-[#4A6644] mt-1">{t.sms.simModeLiveHint}</p>
              </label>
            </div>
          </div>

          {/* Gateway Preset Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#4A6644]">{t.sms.simPresetLabel}</label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'textbee', label: t.sms.simPresetTextBee },
                  { id: 'android_sms_gate', label: t.sms.simPresetAndroidGate },
                  { id: 'pushcut', label: t.sms.simPresetPushcut },
                  { id: 'custom', label: t.sms.simPresetCustom },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectSimPreset(preset.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    simPreset === preset.id
                      ? 'bg-[#254222] text-white border-[#254222]'
                      : 'bg-[#F7FAF4] text-[#254222] border-[#CAE4C5] hover:bg-[#CAE4C5]/40'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* TextBee Device ID helper */}
          {simPreset === 'textbee' && (
            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1">
                {t.sms.simTextbeeDeviceIdLabel}
              </label>
              <input
                type="text"
                dir="ltr"
                value={simForm.textbeeDeviceId}
                onChange={(e) => {
                  const devId = e.target.value;
                  setSimForm((prev) => ({
                    ...prev,
                    textbeeDeviceId: devId,
                    smsApiUrl: devId.trim()
                      ? `https://api.textbee.dev/api/v1/gateway/devices/${devId.trim()}/send-sms`
                      : prev.smsApiUrl,
                  }));
                }}
                placeholder={t.sms.simTextbeeDeviceIdPlaceholder}
                className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-mono text-[#254222]"
              />
            </div>
          )}

          {/* Gateway POST URL */}
          <div>
            <label className="text-xs font-bold text-[#4A6644] mb-1 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span>{t.sms.simGatewayUrlLabel}</span>
            </label>
            <input
              type="url"
              dir="ltr"
              value={simForm.smsApiUrl}
              onChange={(e) => setSimForm({ ...simForm, smsApiUrl: e.target.value })}
              placeholder={t.sms.simGatewayUrlPlaceholder}
              className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-mono text-[#254222] focus:outline-none focus:border-[#254222] focus:bg-white"
            />
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
              <label className="text-xs font-bold text-[#4A6644] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>{t.sms.simApiKeyLabel}</span>
              </label>
              {config.api_key_configured && (
                <span dir="ltr" className="text-[11px] font-semibold text-[#5E7F52]">
                  {t.sms.simApiKeySavedHint} {config.smsApiKeyMasked || '••••'}
                </span>
              )}
            </div>
            <input
              type="password"
              dir="ltr"
              value={simForm.smsApiKey}
              onChange={(e) => setSimForm({ ...simForm, smsApiKey: e.target.value })}
              placeholder={t.sms.simApiKeyPlaceholder}
              className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-mono text-[#254222] focus:outline-none focus:border-[#254222] focus:bg-white"
            />
          </div>

          {/* Sender ID + SIM Plan Label */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1">
                {t.sms.simSenderIdLabel}
              </label>
              <input
                type="text"
                dir="ltr"
                value={simForm.smsSenderId}
                onChange={(e) => setSimForm({ ...simForm, smsSenderId: e.target.value })}
                className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#4A6644] mb-1">
                {t.sms.simPlanLabelField}
              </label>
              <input
                type="text"
                value={simForm.simPlanLabel}
                onChange={(e) => setSimForm({ ...simForm, simPlanLabel: e.target.value })}
                placeholder={t.sms.simPlanPlaceholder}
                className="w-full px-3 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#254222]"
              />
            </div>
          </div>

          {/* Test SMS Box inside Config Modal */}
          <div className="p-3.5 rounded-xl bg-[#F7FAF4] border border-[#CAE4C5] space-y-2.5">
            <div>
              <div className="text-xs font-bold text-[#254222]">{t.sms.simTestSectionTitle}</div>
              <p className="text-[11px] text-[#4A6644]">{t.sms.simTestSectionDesc}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                dir="ltr"
                value={simTestPhone}
                onChange={(e) => setSimTestPhone(e.target.value)}
                placeholder={t.sms.simTestPhonePlaceholder}
                className="flex-1 px-3 py-2 bg-white border border-[#CAE4C5] rounded-xl text-xs font-mono font-bold text-[#254222] tabular-nums"
              />
              <button
                type="button"
                onClick={handleTestSimGatewayFromModal}
                disabled={isTestingSim || isSavingSimConfig}
                className="px-4 py-2 rounded-xl bg-[#99CC66] hover:bg-[#88BC55] text-[#254222] text-xs font-bold cursor-pointer inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isTestingSim ? t.sms.simTestingBtn : t.sms.simSendTestBtn}</span>
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsSimConfigModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-xs font-semibold text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.close}
            </button>
            <button
              type="submit"
              disabled={isSavingSimConfig}
              className="px-5 py-2 bg-[#254222] hover:bg-[#1B3219] text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {isSavingSimConfig ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delivery Details Modal */}
      <Modal
        isOpen={!!selectedLogPayload}
        onClose={() => setSelectedLogPayload(null)}
        title={t.sms.payloadModalTitle}
      >
        {selectedLogPayload && (() => {
          const parsedDetails = safeParseJson(selectedLogPayload.provider_response) as Record<string, any>;
          const detailNote =
            parsedDetails?.errorMessage ||
            parsedDetails?.note ||
            (selectedLogPayload.status === 'FAILED'
              ? t.sms.badgeFailedTitle
              : selectedLogPayload.status === 'DELIVERED' || selectedLogPayload.status === 'Delivered'
              ? t.sms.badgeDeliveredTitle
              : t.sms.badgeSentTitle);
          const channelDisplay =
            selectedLogPayload.provider_name === 'iPhone_Messages_Bridge'
              ? t.sms.sendViaIphoneBtn
              : selectedLogPayload.is_simulated
              ? t.sms.testModeWord
              : config.simPlanLabel || t.sms.simPlanBadgeDefault;

          return (
            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-[#F7FAF4] rounded-xl border border-[#CAE4C5] space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-[#CAE4C5]/70">
                  <span className="font-bold text-[#4A6644]">{t.sms.payloadRoutingStatus}</span>
                  {renderLogStatusBadge(selectedLogPayload.status)}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  <div>
                    <strong className="text-[#4A6644]">{t.sms.payloadChannelLabel}</strong>{' '}
                    <span className="text-[#254222] font-semibold">{channelDisplay}</span>
                  </div>
                  <div>
                    <strong className="text-[#4A6644]">{t.sms.payloadSentAt}</strong>{' '}
                    <span className="text-[#254222]">{new Date(selectedLogPayload.created_at).toLocaleString(locale)}</span>
                  </div>
                </div>
                <div>
                  <strong className="text-[#4A6644]">{t.sms.payloadRecipient}</strong>{' '}
                  <span className="text-[#254222]">{selectedLogPayload.recipient_name}</span> (
                  <span dir="ltr" className="font-mono text-[#254222]">{selectedLogPayload.recipient_phone}</span>)
                </div>
                <div>
                  <strong className="text-[#4A6644]">{t.sms.payloadEncodingVolume}</strong>{' '}
                  <span className="text-[#254222]">
                    {selectedLogPayload.encoding?.toUpperCase().includes('GSM')
                      ? t.sms.formatStandardLabel
                      : t.sms.formatUnicodeLabel}{' '}
                    &bull; {selectedLogPayload.segment_count} {t.sms.messagesWord}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-white rounded-xl border border-[#CAE4C5] space-y-1.5">
                <span className="font-bold text-[#4A6644] block">{t.sms.payloadRawResponse}</span>
                <p className="text-[#254222] leading-relaxed">{String(detailNote)}</p>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
