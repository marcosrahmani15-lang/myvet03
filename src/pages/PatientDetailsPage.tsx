import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Printer,
  Trash2,
  User,
  Phone,
  Info,
  Calendar,
  FileText,
  StickyNote,
  Bell,
  Pill,
  Activity,
  Stethoscope,
  MessageSquare,
  Plus,
  Filter,
  ChevronDown,
  Clock,
  AlertTriangle,
  Archive,
} from 'lucide-react';
import { useClinicData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatLocalizedDate } from '../i18n';
import { api, ApiError } from '../services/apiClient';
import { Modal } from '../components/common/Modal';
import { PrescriptionModal } from '../components/common/PrescriptionModal';
import { formatAlgerianPhone } from '../utils/phoneUtils';
import type {
  Communication,
  MedicalConsultation,
  Patient,
  PatientDocument,
  PatientNote,
  PatientReminder,
  PatientTreatment,
  VitalSign,
} from '../types';

export const PatientDetailsPage: React.FC = () => {
  const { id = 'nina' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    patients,
    appointments: allAppointments,
    vaccinations: allVaccinations,
    updatePatient,
    archivePatient,
    createVaccination,
  } = useClinicData();
  const { session } = useAuth();
  const { language, t, td } = useLanguage();

  const patient = patients.find((p) => p.id === id);

  const [activeTab, setActiveTab] = useState<
    'historique' | 'rdv' | 'documents' | 'notes' | 'rappels' | 'traitements'
  >('historique');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'consultation' | 'vital'>('all');

  const [communications, setCommunications] = useState<Communication[]>([]);
  const [vitals, setVitals] = useState<VitalSign[]>([]);
  const [consultations, setConsultations] = useState<MedicalConsultation[]>([]);
  const [documents, setDocuments] = useState<PatientDocument[]>([]);
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [reminders, setReminders] = useState<PatientReminder[]>([]);
  const [treatments, setTreatments] = useState<PatientTreatment[]>([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [newActionType, setNewActionType] = useState<string | null>(null);

  // Edit form synced when opening edit modal
  const [editForm, setEditForm] = useState<Partial<Patient>>({});

  // Sub-action forms
  const [consultationForm, setConsultationForm] = useState({
    type: 'Consultation générale',
    diagnosis: '',
    treatment: '',
    notes: '',
    veterinarian: session.user?.fullName || 'Dr. Vétérinaire',
  });
  const [vitalForm, setVitalForm] = useState({
    weight: '5 kg',
    temperature: '38.5 °C',
    heartRate: '140 bpm',
  });
  const [noteForm, setNoteForm] = useState('');
  const [docForm, setDocForm] = useState({ name: '', type: 'PDF', size: '1.2 MB' });
  const [reminderForm, setReminderForm] = useState({ title: '', date: '2026-08-20' });
  const [treatmentForm, setTreatmentForm] = useState({
    name: 'Antiparasitaire',
    medication: 'Milbemax',
    dosage: '1 comprimé',
    frequency: 'Tous les 3 mois',
    startDate: '2026-08-14',
    endDate: '2026-11-14',
    instructions: 'À administrer pendant le repas',
  });
  const [vaccineForm, setVaccineForm] = useState({
    vaccineName: 'Vaccin annuel (Rage + Typhus)',
    administeredDate: '2026-08-14',
    nextDueDate: '2027-08-14',
    lotNumber: 'BIO-2026-ALG',
    veterinarian: 'Dr. Vétérinaire',
  });

  const loadMedicalRecords = useCallback(async () => {
    if (!patient?.id) return;
    try {
      const records = await api.get<any[]>(
        `/api/medical-records?animalId=${encodeURIComponent(patient.id)}`
      );
      setConsultations(
        records
          .filter((r) => r.recordType === 'consultation')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            date: r.date || r.recordedAt || '',
            veterinarian: r.veterinarian || r.author || 'Dr. Vétérinaire',
            type: r.type || r.title || 'Consultation',
            diagnosis: r.diagnosis || '',
            treatment: r.treatment || '',
            notes: r.notes || '',
          }))
      );
      setVitals(
        records
          .filter((r) => r.recordType === 'vital')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            date: r.date || r.recordedAt || '',
            weight: r.weight || '—',
            temperature: r.temperature || '—',
            heartRate: r.heartRate || '—',
            notes: r.notes,
          }))
      );
      setNotes(
        records
          .filter((r) => r.recordType === 'note')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            date: r.date || r.recordedAt || '',
            author: r.author || 'Dr. Vétérinaire',
            content: r.content || r.title || '',
          }))
      );
      setDocuments(
        records
          .filter((r) => r.recordType === 'document')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            name: r.name || r.title || 'Document',
            type: r.type || 'PDF',
            uploadDate: r.uploadDate || r.recordedAt || '',
            size: r.size || '—',
          }))
      );
      setReminders(
        records
          .filter((r) => r.recordType === 'reminder')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            title: r.title || '',
            date: r.date || r.recordedAt || '',
            completed: Boolean(r.completed),
          }))
      );
      setTreatments(
        records
          .filter((r) => r.recordType === 'treatment')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            name: r.name || r.title || '',
            medication: r.medication || '',
            dosage: r.dosage || '',
            frequency: r.frequency || '',
            startDate: r.startDate || '',
            endDate: r.endDate || '',
            instructions: r.instructions || '',
            status: r.status || 'En cours',
          }))
      );
      setCommunications(
        records
          .filter((r) => r.recordType === 'communication')
          .map((r) => ({
            id: r.id,
            patientId: patient.id,
            channel: r.channel || 'SMS',
            date: r.date || r.recordedAt || '',
            recipient: r.recipient || patient.ownerName,
            message: r.message || '',
          }))
      );
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.patientDetails.loadError);
    }
  }, [patient?.id, patient?.ownerName, t.patientDetails.loadError]);

  useEffect(() => {
    loadMedicalRecords();
  }, [loadMedicalRecords]);

  if (!patient) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-[#254222]">{t.patientDetails.notFoundTitle}</h2>
        <button
          onClick={() => navigate('/patients')}
          className="text-[#5E7F52] font-semibold flex items-center gap-2 mx-auto cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t.patientDetails.backToPatientsList}
        </button>
      </div>
    );
  }

  const appointments = allAppointments.filter((a) => a.patientId === patient.id);
  const vaccinations = allVaccinations.filter((v) => v.animalId === patient.id);

  const openEditModal = () => {
    setEditForm({
      name: patient.name,
      species: patient.species,
      breed: patient.breed,
      gender: patient.gender,
      weight: patient.weight,
      age: patient.age,
      color: patient.color,
      microchip: patient.microchip,
      veterinarian: patient.veterinarian,
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteOrArchive = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await archivePatient(patient.id);
      setIsDeleteConfirmOpen(false);
      if (res.action === 'deleted') {
        navigate('/patients');
      } else {
        setNoticeMsg(
          res.reason ||
            `${t.patientDetails.archivedNoticePrefix} ${patient.name} ${t.patientDetails.archivedNoticeSuffix}`
        );
      }
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.patientDetails.archiveActionError);
    } finally {
      setSubmitting(false);
    }
  };

  const todayDisplay = formatLocalizedDate(new Date(), language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const handleAddConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post('/api/medical-records', {
        animalId: patient.id,
        recordType: 'consultation',
        recordedAt: todayDisplay,
        author: consultationForm.veterinarian,
        title: consultationForm.type,
        payload: {
          date: todayDisplay,
          veterinarian: consultationForm.veterinarian,
          type: consultationForm.type,
          diagnosis: consultationForm.diagnosis,
          treatment: consultationForm.treatment,
          notes: consultationForm.notes,
        },
      });
      setNewActionType(null);
      setConsultationForm({
        type: t.patientDetails.defaultConsultType,
        diagnosis: '',
        treatment: '',
        notes: '',
        veterinarian: session.user?.fullName || 'Dr. Vétérinaire',
      });
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post('/api/medical-records', {
        animalId: patient.id,
        recordType: 'vital',
        recordedAt: todayDisplay,
        author: session.user?.fullName || 'Dr. Vétérinaire',
        title: 'Constantes vitales',
        payload: {
          date: todayDisplay,
          weight: vitalForm.weight,
          temperature: vitalForm.temperature,
          heartRate: vitalForm.heartRate,
        },
      });
      setNewActionType(null);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post('/api/medical-records', {
        animalId: patient.id,
        recordType: 'note',
        recordedAt: todayDisplay,
        author: session.user?.fullName || 'Dr. Vétérinaire',
        title: 'Note clinique',
        payload: {
          date: todayDisplay,
          author: session.user?.fullName || 'Dr. Vétérinaire',
          content: noteForm.trim(),
        },
      });
      setNoteForm('');
      setNewActionType(null);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.name.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post('/api/medical-records', {
        animalId: patient.id,
        recordType: 'document',
        recordedAt: todayDisplay,
        author: session.user?.fullName || 'Dr. Vétérinaire',
        title: docForm.name.trim(),
        payload: {
          name: docForm.name.trim(),
          type: docForm.type,
          uploadDate: todayDisplay,
          size: docForm.size || '1.2 MB',
        },
      });
      setDocForm({ name: '', type: 'PDF', size: '1.2 MB' });
      setNewActionType(null);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    try {
      await api.delete(`/api/medical-records/${encodeURIComponent(docId)}`);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderForm.title.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post('/api/medical-records', {
        animalId: patient.id,
        recordType: 'reminder',
        recordedAt: reminderForm.date,
        author: session.user?.fullName || 'Dr. Vétérinaire',
        title: reminderForm.title.trim(),
        payload: {
          title: reminderForm.title.trim(),
          date: reminderForm.date,
          completed: false,
        },
      });
      setReminderForm({ title: '', date: '2026-08-20' });
      setNewActionType(null);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleReminder = async (remId: string) => {
    try {
      await api.patch(`/api/medical-records/${encodeURIComponent(remId)}/toggle`);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    }
  };

  const handleAddTreatment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post('/api/medical-records', {
        animalId: patient.id,
        recordType: 'treatment',
        recordedAt: treatmentForm.startDate,
        author: session.user?.fullName || 'Dr. Vétérinaire',
        title: treatmentForm.name,
        payload: {
          ...treatmentForm,
          status: 'En cours',
        },
      });
      setNewActionType(null);
      await loadMedicalRecords();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res: any = await createVaccination({
        animalId: patient.id,
        ownerId: patient.ownerId,
        vaccineName: vaccineForm.vaccineName,
        administeredDate: vaccineForm.administeredDate,
        nextDueDate: vaccineForm.nextDueDate,
        lotNumber: vaccineForm.lotNumber,
        veterinarian: vaccineForm.veterinarian,
        status: 'Effectué',
      });
      setNewActionType(null);
      setNoticeMsg(
        `${t.patientDetails.vaccineSavedNoticePrefix} ${res?.scheduledReminders ?? 3} ${t.patientDetails.vaccineSavedNoticeSuffix}`
      );
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updatePatient(patient.id, editForm);
      setIsEditModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.common.errorOccurred);
    } finally {
      setSubmitting(false);
    }
  };

  const openWhatsApp = () => {
    const cleanPhone = patient.ownerPhone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `${t.patientDetails.whatsappGreetingPrefix} ${patient.ownerName}, ${t.patientDetails.whatsappGreetingMiddle} ${patient.name} ${t.patientDetails.whatsappGreetingEnd} `
    );
    window.open(
      `https://wa.me/213${cleanPhone.replace(/^(213|0)/, '')}?text=${message}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const phoneMeta = formatAlgerianPhone(patient.ownerPhone);

  return (
    <div className="p-6 lg:p-8 w-full max-w-[1240px] mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate('/patients')}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white border border-[#CAE4C5] text-[#254222] text-[13px] font-semibold rounded-lg hover:bg-[#F7FAF4] transition-colors shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#4A6644] rtl:rotate-180" />
          <span>{t.patientDetails.backToListBtn}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {noticeMsg && (
        <div className="p-3.5 bg-[#CAE4C5]/60 border border-[#99CC66] rounded-xl text-[13px] text-[#254222] flex items-center justify-between gap-2">
          <span>{noticeMsg}</span>
          <button onClick={() => setNoticeMsg(null)} className="text-xs font-bold text-[#254222] hover:underline cursor-pointer">
            {t.common.ok}
          </button>
        </div>
      )}

      {/* Main Patient Profile Information Card */}
      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_270px] gap-6 lg:gap-8 items-start">
          {/* Zone A */}
          <div className="flex flex-col items-center w-full md:w-[220px]">
            <div className="w-32 h-32 rounded-2xl bg-[#CAE4C5]/50 border border-[#CAE4C5] flex items-center justify-center text-5xl shadow-2xs select-none">
              <span role="img" aria-label={patient.species}>
                {patient.avatarEmoji || (patient.species === 'Chien' ? '🐶' : '🐱')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-[260px] md:max-w-none mt-4">
              <button
                onClick={openEditModal}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white border border-[#CAE4C5] text-[#254222] text-[12.5px] font-medium rounded-xl hover:bg-[#F7FAF4] transition-colors shadow-2xs cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-[#4A6644] shrink-0" />
                <span className="truncate">{t.patientDetails.editBtn}</span>
              </button>

              <button
                onClick={() => setIsPrescriptionModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-[#CAE4C5] border border-[#99CC66] text-[#254222] text-[12.5px] font-semibold rounded-xl hover:bg-[#99CC66] transition-colors shadow-2xs cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#254222] shrink-0" />
                <span className="truncate">{t.patientDetails.prescriptionBtn}</span>
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white border border-[#CAE4C5] text-[#254222] text-[12.5px] font-medium rounded-xl hover:bg-[#F7FAF4] transition-colors shadow-2xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#4A6644] shrink-0" />
                <span className="truncate">{t.patientDetails.printBtn}</span>
              </button>

              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 bg-white border border-[#FECDD3] text-[#DC2626] text-[12.5px] font-medium rounded-xl hover:bg-[#FEF2F2] transition-colors shadow-2xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#DC2626] shrink-0" />
                <span className="truncate">{t.patientDetails.archiveBtn}</span>
              </button>
            </div>
          </div>

          {/* Zone B */}
          <div className="min-w-0 w-full space-y-4">
            <div className="flex items-center flex-wrap gap-2.5">
              <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">{patient.name}</h1>
              <span className="px-2 py-0.5 rounded-md text-[11.5px] font-semibold bg-[#CAE4C5] text-[#254222] border border-[#99CC66]/60">
                {td('patientStatus', patient.status)}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[11.5px] font-semibold bg-[#ECE2B1] text-[#254222]">
                {td('species', patient.species)}
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-x-3 gap-y-2 text-[13px] text-[#4A6644]">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#5E7F52] shrink-0" />
                <span className="font-medium text-[#254222]">{patient.ownerName}</span>
              </div>
              <span className="text-[#CAE4C5] hidden sm:inline">·</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Phone className="w-4 h-4 text-[#5E7F52] shrink-0" />
                <span className="font-medium text-[#254222] whitespace-nowrap" dir="ltr">{phoneMeta.national}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold whitespace-nowrap ${
                    phoneMeta.carrier === 'Ooredoo'
                      ? 'bg-[#ED1C24]/10 text-[#ED1C24]'
                      : phoneMeta.carrier === 'Mobilis'
                      ? 'bg-[#008542]/10 text-[#008542]'
                      : phoneMeta.carrier === 'Djezzy'
                      ? 'bg-[#E30613]/10 text-[#E30613]'
                      : 'bg-[#ECE2B1] text-[#254222]'
                  }`}
                >
                  {phoneMeta.carrier}
                </span>
              </div>

              <button
                onClick={openWhatsApp}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#22C55E] hover:bg-[#16A34A] text-white text-[11.5px] font-semibold rounded-md transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
              >
                <span>WhatsApp</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-5 pt-2">
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldBreed}</span>
                <span className="text-[13.5px] font-bold text-[#254222] block break-words">{patient.breed || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldColor}</span>
                <span className="text-[13.5px] font-bold text-[#254222] block break-words">{patient.color || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldGender}</span>
                <span className="text-[13.5px] font-bold text-[#254222] block break-words">{patient.gender ? td('gender', patient.gender) : '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldAge}</span>
                <span className="text-[13.5px] font-bold text-[#254222] block break-words tabular-nums">{patient.age || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldBirthDate}</span>
                <span className="text-[13.5px] font-bold text-[#254222] block whitespace-nowrap tabular-nums" dir="ltr">{patient.birthDate || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldWeight}</span>
                <span className="text-[13.5px] font-bold text-[#254222] block break-words tabular-nums">{patient.weight || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">{t.patientDetails.fieldMicrochip}</span>
                <span className="text-[13px] font-mono font-bold text-[#254222] block break-all" dir="ltr">{patient.microchip || '—'}</span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">
                  {t.patientDetails.fieldNextVisit}
                </span>
                <span
                  className="text-[13.5px] font-bold text-[#254222] block break-words"
                  title={patient.nextVisit}
                >
                  {patient.nextVisit || t.patientDetails.noVisitScheduled}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-[11px] font-bold text-[#5E7F52] tracking-wider uppercase mb-0.5">
                  {t.patientDetails.fieldReferringVet}
                </span>
                <span className="text-[13.5px] font-bold text-[#254222] block break-words">{patient.veterinarian || '—'}</span>
              </div>
            </div>
          </div>

          {/* Zone C */}
          <div className="md:col-span-2 xl:col-span-1 w-full border-t border-[#CAE4C5] pt-5 xl:border-t-0 xl:pt-0 xl:border-s xl:ps-6 space-y-2.5">
            <span className="block text-[11.5px] font-bold text-[#4A6644] tracking-wider uppercase">
              {t.patientDetails.medicalAlertsHeading}
            </span>

            {patient.medicalAlerts && patient.medicalAlerts.length > 0 ? (
              patient.medicalAlerts.map((al) => (
                <div key={al.id} className="bg-[#ECE2B1]/60 border border-[#ECE2B1] rounded-xl p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Info className="w-4 h-4 text-[#254222] shrink-0" />
                    <span className="text-[13px] font-bold text-[#254222]">{al.type}</span>
                    <span className="px-1.5 py-0.2 bg-[#254222] text-white text-[10px] font-bold rounded">
                      {al.badge}
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold text-[#254222] ps-5">{al.description}</p>
                </div>
              ))
            ) : (
              <div className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl p-3.5 text-[12.5px] text-[#4A6644]">
                {t.patientDetails.noCriticalAlerts}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs & Medical History */}
      <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-hidden">
        <div className="flex items-center border-b border-[#CAE4C5] px-4 overflow-x-auto select-none bg-white">
          <button
            onClick={() => setActiveTab('historique')}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'historique'
                ? 'text-[#254222] border-[#254222] bg-[#CAE4C5]/50'
                : 'text-[#4A6644] border-transparent hover:text-[#254222]'
            }`}
          >
            <Stethoscope className={`w-4 h-4 ${activeTab === 'historique' ? 'text-[#5E7F52]' : 'text-[#5E7F52]/80'}`} />
            <span>{t.patientDetails.tabHistory}</span>
          </button>

          <button
            onClick={() => setActiveTab('rdv')}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'rdv'
                ? 'text-[#254222] border-[#254222] bg-[#CAE4C5]/50'
                : 'text-[#4A6644] border-transparent hover:text-[#254222]'
            }`}
          >
            <Calendar className={`w-4 h-4 ${activeTab === 'rdv' ? 'text-[#5E7F52]' : 'text-[#5E7F52]/80'}`} />
            <span>{t.patientDetails.tabAppointments}</span>
            <span className="px-1.5 py-0.5 text-[11px] font-bold bg-[#CAE4C5] text-[#254222] rounded-full">
              {appointments.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'documents'
                ? 'text-[#254222] border-[#254222] bg-[#CAE4C5]/50'
                : 'text-[#4A6644] border-transparent hover:text-[#254222]'
            }`}
          >
            <FileText className={`w-4 h-4 ${activeTab === 'documents' ? 'text-[#5E7F52]' : 'text-[#5E7F52]/80'}`} />
            <span>{t.patientDetails.tabDocuments}</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'notes'
                ? 'text-[#254222] border-[#254222] bg-[#CAE4C5]/50'
                : 'text-[#4A6644] border-transparent hover:text-[#254222]'
            }`}
          >
            <StickyNote className={`w-4 h-4 ${activeTab === 'notes' ? 'text-[#5E7F52]' : 'text-[#5E7F52]/80'}`} />
            <span>{t.patientDetails.tabNotes}</span>
          </button>

          <button
            onClick={() => setActiveTab('rappels')}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'rappels'
                ? 'text-[#254222] border-[#254222] bg-[#CAE4C5]/50'
                : 'text-[#4A6644] border-transparent hover:text-[#254222]'
            }`}
          >
            <Bell className={`w-4 h-4 ${activeTab === 'rappels' ? 'text-[#5E7F52]' : 'text-[#5E7F52]/80'}`} />
            <span>{t.patientDetails.tabReminders}</span>
          </button>

          <button
            onClick={() => setActiveTab('traitements')}
            className={`flex items-center gap-2 px-4 py-3.5 text-[13.5px] font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'traitements'
                ? 'text-[#254222] border-[#254222] bg-[#CAE4C5]/50'
                : 'text-[#4A6644] border-transparent hover:text-[#254222]'
            }`}
          >
            <Pill className={`w-4 h-4 ${activeTab === 'traitements' ? 'text-[#5E7F52]' : 'text-[#5E7F52]/80'}`} />
            <span>{t.patientDetails.tabTreatments}</span>
          </button>
        </div>

        {/* Tab 1: Historique */}
        {activeTab === 'historique' && (
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-[#254222]">{t.patientDetails.medicalHistoryTitle}</h2>

              <div className="flex items-center gap-2.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CAE4C5] rounded-xl text-[13px] font-semibold text-[#254222]">
                  <Filter className="w-3.5 h-3.5 text-[#4A6644]" />
                  <select
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value as any)}
                    className="bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="all">{t.patientDetails.filterAll}</option>
                    <option value="consultation">{t.patientDetails.filterConsultations}</option>
                    <option value="vital">{t.patientDetails.filterVitals}</option>
                  </select>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#254222] hover:bg-[#1B3219] text-white text-[13px] font-semibold rounded-xl transition-colors shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.patientDetails.addMenuBtn}</span>
                    <ChevronDown className="w-3.5 h-3.5 ms-0.5" />
                  </button>

                  {isAddMenuOpen && (
                    <div className="absolute end-0 mt-2 w-56 bg-white border border-[#CAE4C5] rounded-xl shadow-xl z-20 py-1">
                      <button
                        onClick={() => { setIsAddMenuOpen(false); setNewActionType('consultation'); }}
                        className="w-full text-start px-4 py-2 text-[13px] hover:bg-[#F7FAF4] text-[#254222] flex items-center gap-2 cursor-pointer"
                      >
                        <Stethoscope className="w-4 h-4 text-[#5E7F52]" />
                        <span>{t.patientDetails.menuNewConsult}</span>
                      </button>
                      <button
                        onClick={() => { setIsAddMenuOpen(false); setIsPrescriptionModalOpen(true); }}
                        className="w-full text-start px-4 py-2 text-[13px] hover:bg-[#F7FAF4] text-[#254222] flex items-center gap-2 cursor-pointer font-medium"
                      >
                        <FileText className="w-4 h-4 text-[#5E7F52]" />
                        <span>{t.patientDetails.menuPrescription}</span>
                      </button>
                      <button
                        onClick={() => { setIsAddMenuOpen(false); setNewActionType('vitals'); }}
                        className="w-full text-start px-4 py-2 text-[13px] hover:bg-[#F7FAF4] text-[#254222] flex items-center gap-2 cursor-pointer"
                      >
                        <Activity className="w-4 h-4 text-[#5E7F52]" />
                        <span>{t.patientDetails.menuVitals}</span>
                      </button>
                      <button
                        onClick={() => { setIsAddMenuOpen(false); setNewActionType('note'); }}
                        className="w-full text-start px-4 py-2 text-[13px] hover:bg-[#F7FAF4] text-[#254222] flex items-center gap-2 cursor-pointer"
                      >
                        <StickyNote className="w-4 h-4 text-[#5E7F52]" />
                        <span>{t.patientDetails.menuNote}</span>
                      </button>
                      <button
                        onClick={() => { setIsAddMenuOpen(false); setNewActionType('reminder'); }}
                        className="w-full text-start px-4 py-2 text-[13px] hover:bg-[#F7FAF4] text-[#254222] flex items-center gap-2 cursor-pointer"
                      >
                        <Bell className="w-4 h-4 text-[#5E7F52]" />
                        <span>{t.patientDetails.menuReminder}</span>
                      </button>
                      <button
                        onClick={() => { setIsAddMenuOpen(false); setNewActionType('treatment'); }}
                        className="w-full text-start px-4 py-2 text-[13px] hover:bg-[#F7FAF4] text-[#254222] flex items-center gap-2 cursor-pointer"
                      >
                        <Pill className="w-4 h-4 text-[#5E7F52]" />
                        <span>{t.patientDetails.menuTreatment}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white border border-[#CAE4C5] rounded-xl p-4 shadow-2xs space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#5E7F52]" />
                  <span className="text-[14px] font-bold text-[#254222]">{t.patientDetails.cardVitalsTitle}</span>
                </div>
                {vitals.length > 0 ? (
                  <div className="space-y-1 text-[13px] tabular-nums">
                    <div className="text-[#254222] font-medium">{t.patientDetails.weightPrefix} {vitals[0].weight}</div>
                    <div className="text-[#254222] font-medium">{t.patientDetails.tempPrefix} {vitals[0].temperature}</div>
                    <div className="text-[11px] text-[#5E7F52]">{vitals[0].date}</div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#4A6644]">{t.patientDetails.noVitalsRecorded}</p>
                )}
              </div>

              <div className="bg-white border border-[#CAE4C5] rounded-xl p-4 shadow-2xs space-y-2">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-[#5E7F52]" />
                  <span className="text-[14px] font-bold text-[#254222]">{t.patientDetails.cardVisitsTitle}</span>
                </div>
                {consultations.length > 0 ? (
                  <div className="space-y-1 text-[13px]">
                    <div className="font-semibold text-[#254222]">{consultations[0].type}</div>
                    <div className="text-[12px] text-[#4A6644]">{consultations[0].diagnosis}</div>
                    <div className="text-[11px] text-[#5E7F52]">{consultations[0].date}</div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#4A6644]">{t.patientDetails.noConsultationsRecorded}</p>
                )}
              </div>

              <div className="bg-white border border-[#CAE4C5] rounded-xl p-4 shadow-2xs space-y-2">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#5E7F52]" />
                  <span className="text-[14px] font-bold text-[#254222]">{t.patientDetails.cardCommsTitle}</span>
                </div>
                {communications.length > 0 ? (
                  <div className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-[#5E7F52]">{communications[0].channel}</span>
                      <span className="text-[11px] text-[#5E7F52]">{communications[0].date}</span>
                    </div>
                    <p className="text-[12px] text-[#4A6644] leading-relaxed line-clamp-3">
                      {communications[0].message}
                    </p>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#4A6644]">{t.patientDetails.noCommsRecorded}</p>
                )}
              </div>
            </div>

            {historyFilter === 'vital' ? (
              <div className="space-y-3">
                {vitals.map((v) => (
                  <div key={v.id} className="p-4 border border-[#CAE4C5] rounded-xl flex justify-between text-[13px] tabular-nums">
                    <span className="font-bold text-[#254222]">
                      {t.patientDetails.weightPrefix} {v.weight} · {t.patientDetails.tempPrefix} {v.temperature} · {t.patientDetails.heartRatePrefix} {v.heartRate}
                    </span>
                    <span className="text-[#5E7F52]">{v.date}</span>
                  </div>
                ))}
                {vitals.length === 0 && (
                  <p className="text-center text-[13px] text-[#4A6644] py-6">{t.patientDetails.noVitalsFull}</p>
                )}
              </div>
            ) : consultations.length === 0 ? (
              <div className="border border-[#CAE4C5] rounded-2xl p-12 text-center bg-white space-y-3">
                <div className="w-16 h-16 rounded-full bg-[#CAE4C5] text-[#254222] flex items-center justify-center mx-auto">
                  <Stethoscope className="w-8 h-8" />
                </div>
                <h3 className="text-[16px] font-bold text-[#254222]">{t.patientDetails.noConsultTitle}</h3>
                <p className="text-[13.5px] text-[#4A6644] max-w-md mx-auto">
                  {t.patientDetails.noConsultDesc}
                </p>
                <button
                  onClick={() => setNewActionType('consultation')}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#254222] hover:bg-[#1B3219] text-white text-[13px] font-semibold rounded-xl transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.patientDetails.createConsultBtn}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {consultations.map((c) => (
                  <div key={c.id} className="p-4 border border-[#CAE4C5] rounded-xl space-y-1.5 hover:bg-[#F7FAF4] transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[14px] text-[#254222]">{c.type}</span>
                      <span className="text-[12px] text-[#5E7F52]">{c.date} · {c.veterinarian}</span>
                    </div>
                    <p className="text-[13px] text-[#4A6644]"><strong>{t.patientDetails.diagnosisPrefix}</strong> {c.diagnosis}</p>
                    {c.treatment && <p className="text-[13px] text-[#4A6644]"><strong>{t.patientDetails.treatmentPrefix}</strong> {c.treatment}</p>}
                    {c.notes && <p className="text-[12px] text-[#5E7F52] italic">{c.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Rendez-vous */}
        {activeTab === 'rdv' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#254222]">{t.patientDetails.scheduledAptsTitle}</h2>
              <button
                onClick={() => navigate('/agenda')}
                className="text-[13px] font-semibold text-[#5E7F52] hover:underline cursor-pointer"
              >
                {t.patientDetails.viewInAgendaLink}
              </button>
            </div>

            {appointments.length === 0 ? (
              <p className="text-[13px] text-[#4A6644] py-6 text-center">{t.patientDetails.noAptsForPatientPrefix} {patient.name}.</p>
            ) : (
              <div className="divide-y divide-[#CAE4C5] border border-[#CAE4C5] rounded-xl overflow-hidden">
                {appointments.map((a) => (
                  <div key={a.id} className="p-4 flex items-center justify-between hover:bg-[#F7FAF4]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#CAE4C5] text-[#254222] flex items-center justify-center font-bold">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[14px] text-[#254222]">{a.reason}</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[#ECE2B1] text-[#254222]">{td('appointmentType', a.type)}</span>
                        </div>
                        <span className="text-[12.5px] text-[#4A6644]">
                          <span dir="ltr">{a.date}</span> {t.patientDetails.atWord} <span dir="ltr">{a.startTime} ({a.endTime})</span> · {a.veterinarian}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#CAE4C5] text-[#254222]">
                      {td('appointmentStatus', a.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Documents */}
        {activeTab === 'documents' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#254222]">{t.patientDetails.medicalDocsTitle}</h2>
              <button
                onClick={() => setNewActionType('document')}
                className="px-3.5 py-1.5 bg-[#254222] text-white text-[13px] font-semibold rounded-xl hover:bg-[#1B3219] cursor-pointer"
              >
                {t.patientDetails.addDocBtn}
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="border border-[#CAE4C5] rounded-2xl p-8 text-center bg-white space-y-2">
                <FileText className="w-10 h-10 text-[#5E7F52] mx-auto" />
                <h3 className="text-[15px] font-bold text-[#254222]">{t.patientDetails.noDocsTitle}</h3>
                <p className="text-[13px] text-[#4A6644]">{t.patientDetails.noDocsDesc}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div key={d.id} className="p-3 border border-[#CAE4C5] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-[#5E7F52]" />
                      <div>
                        <h4 className="text-[13.5px] font-bold text-[#254222]">{d.name}</h4>
                        <span className="text-[11.5px] text-[#5E7F52]">{td('docType', d.type)} · {d.uploadDate} · {d.size}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(d.id)}
                      className="text-xs text-[#DC2626] hover:underline cursor-pointer"
                    >
                      {t.common.delete}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Notes */}
        {activeTab === 'notes' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#254222]">{t.patientDetails.observationNotesTitle}</h2>
              <button
                onClick={() => setNewActionType('note')}
                className="px-3.5 py-1.5 bg-[#254222] text-white text-[13px] font-semibold rounded-xl hover:bg-[#1B3219] cursor-pointer"
              >
                {t.patientDetails.addNoteBtn}
              </button>
            </div>

            {notes.length === 0 ? (
              <div className="border border-[#CAE4C5] rounded-2xl p-8 text-center bg-white space-y-2">
                <StickyNote className="w-10 h-10 text-[#5E7F52] mx-auto" />
                <h3 className="text-[15px] font-bold text-[#254222]">{t.patientDetails.noNotesTitle}</h3>
                <p className="text-[13px] text-[#4A6644]">{t.patientDetails.noNotesDesc}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="p-3.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-[11.5px] text-[#5E7F52]">
                      <span>{n.author}</span>
                      <span>{n.date}</span>
                    </div>
                    <p className="text-[13px] text-[#254222]">{n.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Rappels */}
        {activeTab === 'rappels' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[18px] font-bold text-[#254222]">{t.patientDetails.remindersAlertsTitle}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewActionType('vaccine')}
                  className="px-3.5 py-1.5 bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] text-[13px] font-semibold rounded-xl cursor-pointer transition-colors"
                >
                  {t.patientDetails.recordVaccineBtn}
                </button>
                <button
                  onClick={() => setNewActionType('reminder')}
                  className="px-3.5 py-1.5 bg-[#254222] text-white text-[13px] font-semibold rounded-xl hover:bg-[#1B3219] cursor-pointer"
                >
                  {t.patientDetails.createReminderBtn}
                </button>
              </div>
            </div>

            {vaccinations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[12px] font-bold text-[#5E7F52] uppercase tracking-wider">
                    {t.patientDetails.vaccineProtocolHeading}
                  </span>
                  <span className="text-[11px] font-semibold text-[#4A6644]">
                    {t.patientDetails.smsScheduleHint}
                  </span>
                </div>
                {vaccinations.map((v) => (
                  <div key={v.id} className="p-3.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-[14px] text-[#254222]">{v.vaccineName}</span>
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[#ECE2B1] text-[#254222]">
                          {t.patientDetails.nextDuePrefix} {v.nextDueDate}
                        </span>
                      </div>
                      <div className="text-[12px] text-[#4A6644]">
                        {t.patientDetails.practitionerPrefix} {v.veterinarian} · {t.patientDetails.lotPrefix} {v.lotNumber || 'BIO-2026'}
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[#99CC66]/35 text-[#254222] flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#99CC66]"></span>
                      {t.patientDetails.smsRemindersActiveBadge}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2">
              <span className="text-[12px] font-bold text-[#4A6644] uppercase tracking-wider block mb-2">
                {t.patientDetails.clinicalAlertsHeading}
              </span>
              {reminders.length === 0 ? (
                <div className="border border-[#CAE4C5] rounded-2xl p-6 text-center bg-white space-y-2">
                  <Bell className="w-8 h-8 text-[#5E7F52] mx-auto" />
                  <h3 className="text-[14px] font-bold text-[#254222]">{t.patientDetails.noClinicalTasksTitle}</h3>
                  <p className="text-[12.5px] text-[#4A6644]">{t.patientDetails.noClinicalTasksDesc}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reminders.map((r) => (
                    <div key={r.id} className="p-3 border border-[#CAE4C5] rounded-xl flex items-center justify-between bg-white">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={r.completed}
                          onChange={() => handleToggleReminder(r.id)}
                          className="w-4 h-4 accent-[#254222] rounded border-[#CAE4C5] cursor-pointer"
                        />
                        <span className={`text-[13.5px] font-medium ${r.completed ? 'line-through text-[#5E7F52]' : 'text-[#254222]'}`}>
                          {r.title}
                        </span>
                      </div>
                      <span className="text-[12px] text-[#4A6644] flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {r.date}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Traitements */}
        {activeTab === 'traitements' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-bold text-[#254222]">{t.patientDetails.treatmentsTitle}</h2>
              <button
                onClick={() => setNewActionType('treatment')}
                className="px-3.5 py-1.5 bg-[#254222] text-white text-[13px] font-semibold rounded-xl hover:bg-[#1B3219] cursor-pointer"
              >
                {t.patientDetails.addTreatmentBtn}
              </button>
            </div>

            {treatments.length === 0 ? (
              <div className="border border-[#CAE4C5] rounded-2xl p-8 text-center bg-white space-y-2">
                <Pill className="w-10 h-10 text-[#5E7F52] mx-auto" />
                <h3 className="text-[15px] font-bold text-[#254222]">{t.patientDetails.noTreatmentsTitle}</h3>
                <p className="text-[13px] text-[#4A6644]">{t.patientDetails.noTreatmentsDesc}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {treatments.map((tr) => (
                  <div key={tr.id} className="p-4 border border-[#CAE4C5] rounded-xl space-y-2 bg-[#F7FAF4]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[14px] text-[#254222]">{tr.name} ({tr.medication})</span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#CAE4C5] text-[#254222]">
                          {tr.status}
                        </span>
                      </div>
                      <span className="text-[12px] text-[#4A6644]">{t.patientDetails.fromWord} {tr.startDate} {t.patientDetails.toWord} {tr.endDate}</span>
                    </div>
                    <p className="text-[13px] text-[#4A6644]">{t.patientDetails.dosagePrefix} {tr.dosage} · {tr.frequency}</p>
                    <p className="text-[12px] text-[#5E7F52] italic">{t.patientDetails.instructionsPrefix} {tr.instructions}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <PrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
        patient={patient}
      />

      {/* Archive / Delete Confirm Modal */}
      <Modal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        title={`${t.patientDetails.archiveModalTitlePrefix} ${patient.name}`}
      >
        <div className="space-y-4">
          <p className="text-[13.5px] text-[#4A6644]">
            {t.patientDetails.archiveModalDescPrefix}{' '}
            <strong className="text-[#254222]">{t.patientDetails.archiveModalArchivedWord}</strong>{' '}
            {t.patientDetails.archiveModalDescSuffix}
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button
              type="button"
              onClick={() => setIsDeleteConfirmOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleDeleteOrArchive}
              disabled={submitting}
              className="px-4 py-2 bg-[#DC2626] text-white rounded-xl text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Archive className="w-4 h-4" />
              <span>{submitting ? t.patientDetails.processingBtn : t.common.confirm}</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Patient Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={t.patientDetails.editModalTitle}>
        <form onSubmit={handleUpdatePatient} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formNameLabel}</label>
              <input
                type="text"
                value={editForm.name || ''}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formSpeciesLabel}</label>
              <select
                value={editForm.species || 'Chat'}
                onChange={(e) => setEditForm({ ...editForm, species: e.target.value as Patient['species'] })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              >
                <option value="Chat">{td('species', 'Chat')}</option>
                <option value="Chien">{td('species', 'Chien')}</option>
                <option value="Autre">{td('species', 'Autre')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formBreedLabel}</label>
              <input
                type="text"
                value={editForm.breed || ''}
                onChange={(e) => setEditForm({ ...editForm, breed: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formGenderLabel}</label>
              <select
                value={editForm.gender || 'Femelle'}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as Patient['gender'] })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              >
                <option value="Femelle">{td('gender', 'Femelle')}</option>
                <option value="Mâle">{td('gender', 'Mâle')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formWeightLabel}</label>
              <input
                type="text"
                value={editForm.weight || ''}
                onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formAgeLabel}</label>
              <input
                type="text"
                value={editForm.age || ''}
                onChange={(e) => setEditForm({ ...editForm, age: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formMicrochipLabel}</label>
              <input
                type="text"
                dir="ltr"
                value={editForm.microchip || ''}
                onChange={(e) => setEditForm({ ...editForm, microchip: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none font-mono text-[#254222]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.formVetLabel}</label>
              <input
                type="text"
                value={editForm.veterinarian || ''}
                onChange={(e) => setEditForm({ ...editForm, veterinarian: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] font-medium text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Consultation Modal */}
      <Modal isOpen={newActionType === 'consultation'} onClose={() => setNewActionType(null)} title={t.patientDetails.consultModalTitle}>
        <form onSubmit={handleAddConsultation} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.consultTypeLabel}</label>
            <input
              type="text"
              value={consultationForm.type}
              onChange={(e) => setConsultationForm({ ...consultationForm, type: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.consultDiagLabel}</label>
            <textarea
              value={consultationForm.diagnosis}
              onChange={(e) => setConsultationForm({ ...consultationForm, diagnosis: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.consultTreatmentLabel}</label>
            <textarea
              value={consultationForm.treatment}
              onChange={(e) => setConsultationForm({ ...consultationForm, treatment: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.patientDetails.consultCreateBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Vitals Modal */}
      <Modal isOpen={newActionType === 'vitals'} onClose={() => setNewActionType(null)} title={t.patientDetails.vitalsModalTitle}>
        <form onSubmit={handleAddVitals} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vitalsWeightLabel}</label>
              <input
                type="text"
                value={vitalForm.weight}
                onChange={(e) => setVitalForm({ ...vitalForm, weight: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vitalsTempLabel}</label>
              <input
                type="text"
                value={vitalForm.temperature}
                onChange={(e) => setVitalForm({ ...vitalForm, temperature: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vitalsHeartRateLabel}</label>
              <input
                type="text"
                value={vitalForm.heartRate}
                onChange={(e) => setVitalForm({ ...vitalForm, heartRate: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.patientDetails.vitalsSaveBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Document Modal */}
      <Modal isOpen={newActionType === 'document'} onClose={() => setNewActionType(null)} title={t.patientDetails.docModalTitle}>
        <form onSubmit={handleAddDocument} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.docNameLabel}</label>
            <input
              type="text"
              value={docForm.name}
              onChange={(e) => setDocForm({ ...docForm, name: e.target.value })}
              placeholder={t.patientDetails.docNamePlaceholder}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.docCategoryLabel}</label>
              <select
                value={docForm.type}
                onChange={(e) => setDocForm({ ...docForm, type: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white text-[#254222]"
              >
                <option value="PDF">{td('docType', 'PDF')}</option>
                <option value="Radiographie">{td('docType', 'Radiographie')}</option>
                <option value="Analyse biologique">{td('docType', 'Analyse biologique')}</option>
                <option value="Ordonnance">{td('docType', 'Ordonnance')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.docSizeLabel}</label>
              <input
                type="text"
                dir="ltr"
                value={docForm.size}
                onChange={(e) => setDocForm({ ...docForm, size: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.common.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Note Modal */}
      <Modal isOpen={newActionType === 'note'} onClose={() => setNewActionType(null)} title={t.patientDetails.noteModalTitle}>
        <form onSubmit={handleAddNote} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.noteObsLabel}</label>
            <textarea
              value={noteForm}
              onChange={(e) => setNoteForm(e.target.value)}
              rows={4}
              placeholder={t.patientDetails.notePlaceholder}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.patientDetails.noteSaveBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reminder Modal */}
      <Modal isOpen={newActionType === 'reminder'} onClose={() => setNewActionType(null)} title={t.patientDetails.reminderModalTitle}>
        <form onSubmit={handleAddReminder} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.reminderTitleLabel}</label>
            <input
              type="text"
              value={reminderForm.title}
              onChange={(e) => setReminderForm({ ...reminderForm, title: e.target.value })}
              placeholder={t.patientDetails.reminderPlaceholder}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.reminderDueLabel}</label>
            <input
              type="date"
              dir="ltr"
              value={reminderForm.date}
              onChange={(e) => setReminderForm({ ...reminderForm, date: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.patientDetails.reminderCreateBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Treatment Modal */}
      <Modal isOpen={newActionType === 'treatment'} onClose={() => setNewActionType(null)} title={t.patientDetails.treatmentModalTitle}>
        <form onSubmit={handleAddTreatment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.treatmentNameLabel}</label>
              <input
                type="text"
                value={treatmentForm.name}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, name: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.treatmentMedLabel}</label>
              <input
                type="text"
                value={treatmentForm.medication}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, medication: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.treatmentDosageLabel}</label>
              <input
                type="text"
                value={treatmentForm.dosage}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, dosage: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.treatmentFreqLabel}</label>
              <input
                type="text"
                value={treatmentForm.frequency}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, frequency: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.treatmentInstrLabel}</label>
            <input
              type="text"
              value={treatmentForm.instructions}
              onChange={(e) => setTreatmentForm({ ...treatmentForm, instructions: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.patientDetails.treatmentAddBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Vaccine Modal */}
      <Modal
        isOpen={newActionType === 'vaccine'}
        onClose={() => setNewActionType(null)}
        title={t.patientDetails.vaccineModalTitle}
      >
        <form onSubmit={handleAddVaccine} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vaccineNameLabel}</label>
            <input
              type="text"
              value={vaccineForm.vaccineName}
              onChange={(e) => setVaccineForm({ ...vaccineForm, vaccineName: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vaccineInjectDateLabel}</label>
              <input
                type="date"
                dir="ltr"
                value={vaccineForm.administeredDate}
                onChange={(e) => setVaccineForm({ ...vaccineForm, administeredDate: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vaccineNextDueLabel}</label>
              <input
                type="date"
                dir="ltr"
                value={vaccineForm.nextDueDate}
                onChange={(e) => setVaccineForm({ ...vaccineForm, nextDueDate: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vaccineLotLabel}</label>
              <input
                type="text"
                dir="ltr"
                value={vaccineForm.lotNumber}
                onChange={(e) => setVaccineForm({ ...vaccineForm, lotNumber: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none font-mono text-[#254222]"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patientDetails.vaccineVetLabel}</label>
              <select
                value={vaccineForm.veterinarian}
                onChange={(e) => setVaccineForm({ ...vaccineForm, veterinarian: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white text-[#254222]"
              >
                <option value="Dr. Vétérinaire">Dr. Vétérinaire</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-[#ECE2B1]/60 border border-[#99CC66]/50 rounded-xl text-xs text-[#254222] space-y-1">
            <div className="font-bold text-[#254222]">{t.patientDetails.vaccineAutoBoxTitle}</div>
            <p className="text-[#4A6644]">
              {t.patientDetails.vaccineAutoBoxDescPrefix} {patient.ownerName} (<span dir="ltr">{patient.ownerPhone}</span>).
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setNewActionType(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {t.patientDetails.vaccineSaveBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
