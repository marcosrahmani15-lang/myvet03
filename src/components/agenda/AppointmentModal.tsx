import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Appointment, AppointmentType, AppointmentStatus } from '../../types';
import { useClinicData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apt: Partial<Appointment>) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  initialAppointment?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
}

export const AppointmentModal: React.FC<AppointmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialAppointment,
  defaultDate = '2026-08-14',
  defaultTime = '09:00'
}) => {
  const { patients } = useClinicData();
  const { t, td } = useLanguage();

  const [patientId, setPatientId] = useState(initialAppointment?.patientId || (patients[0]?.id || ''));
  const [date, setDate] = useState(initialAppointment?.date || defaultDate);
  const [startTime, setStartTime] = useState(initialAppointment?.startTime || defaultTime);
  const [type, setType] = useState<AppointmentType>(initialAppointment?.type || 'Consultation');
  const [reason, setReason] = useState(initialAppointment?.reason || '');
  const [veterinarian, setVeterinarian] = useState(initialAppointment?.veterinarian || 'Dr. Vétérinaire');
  const [status, setStatus] = useState<AppointmentStatus>(initialAppointment?.status || 'Confirmé');
  const [notes, setNotes] = useState(initialAppointment?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    if (initialAppointment) {
      setPatientId(initialAppointment.patientId);
      setDate(initialAppointment.date);
      setStartTime(initialAppointment.startTime);
      setType(initialAppointment.type);
      setReason(initialAppointment.reason);
      setVeterinarian(initialAppointment.veterinarian);
      setStatus(initialAppointment.status);
      setNotes(initialAppointment.notes || '');
    } else {
      setPatientId(patients[0]?.id || '');
      setDate(defaultDate);
      setStartTime(defaultTime);
      setType('Consultation');
      setReason('');
      setVeterinarian('Dr. Vétérinaire');
      setStatus('Confirmé');
      setNotes('');
    }
  }, [initialAppointment, defaultDate, defaultTime, isOpen, patients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const patient = patients.find(p => p.id === patientId);
    if (!patient) {
      setErrorMsg(t.appointmentModal.selectPatientError);
      return;
    }

    // Compute end time ~30 mins after start time
    const [h, m] = startTime.split(':').map(Number);
    const endM = (m + 30) % 60;
    const endH = h + Math.floor((m + 30) / 60);
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const aptData: Partial<Appointment> = {
      ...(initialAppointment ? { id: initialAppointment.id } : {}),
      patientId: patient.id,
      patientName: patient.name,
      clientId: patient.ownerId,
      clientName: patient.ownerName,
      date,
      startTime,
      endTime,
      type,
      reason: reason || (type === 'Vaccin' ? 'Vaccination' : type),
      veterinarian,
      status,
      notes
    };

    setSubmitting(true);
    try {
      await onSave(aptData);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || t.appointmentModal.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!initialAppointment || !onDelete) return;
    if (!window.confirm(t.appointmentModal.deleteConfirm)) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await onDelete(initialAppointment.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || t.appointmentModal.deleteError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialAppointment ? t.appointmentModal.editTitle : t.appointmentModal.createTitle}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Patient Selection */}
        <div>
          <label className="block text-[13px] font-semibold text-[#254222] mb-1">
            {t.appointmentModal.patientLabel}
          </label>
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
            required
          >
            <option value="" disabled>{t.appointmentModal.selectPatientPlaceholder}</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({td('species', p.species)} - {p.breed}) — {t.appointmentModal.ownerPrefix} {p.ownerName}
              </option>
            ))}
          </select>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.appointmentModal.dateLabel}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.appointmentModal.startTimeLabel}
            </label>
            <select
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
              required
            >
              {['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00'].map(tSlot => (
                <option key={tSlot} value={tSlot}>{tSlot}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Type & Veterinarian */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.appointmentModal.typeLabel}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as AppointmentType)}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
            >
              {(['Consultation', 'Vaccin', 'Urgence', 'Contrôle'] as AppointmentType[]).map((opt) => (
                <option key={opt} value={opt}>{td('appointmentType', opt)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.appointmentModal.vetLabel}
            </label>
            <select
              value={veterinarian}
              onChange={(e) => setVeterinarian(e.target.value)}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
            >
              <option value="Dr. Vétérinaire">Dr. Vétérinaire</option>
            </select>
          </div>
        </div>

        {/* Reason / Title */}
        <div>
          <label className="block text-[13px] font-semibold text-[#254222] mb-1">
            {t.appointmentModal.reasonLabel}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.appointmentModal.reasonPlaceholder}
            className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
            required
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-[13px] font-semibold text-[#254222] mb-1">
            {t.appointmentModal.statusLabel}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['Confirmé', 'En attente', 'Annulé'] as AppointmentStatus[]).map(st => (
              <button
                key={st}
                type="button"
                onClick={() => setStatus(st)}
                className={`py-2 text-[13px] font-semibold rounded-xl border transition-all cursor-pointer ${
                  status === st
                    ? st === 'Confirmé'
                      ? 'bg-[#CAE4C5] border-[#99CC66] text-[#254222]'
                      : st === 'Annulé'
                      ? 'bg-rose-50 border-rose-300 text-rose-700'
                      : 'bg-[#ECE2B1] border-[#99CC66]/60 text-[#254222]'
                    : 'bg-white border-[#CAE4C5] text-[#4A6644]'
                }`}
              >
                {td('appointmentStatus', st)}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[13px] font-semibold text-[#254222] mb-1">
            {t.appointmentModal.notesLabel}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t.appointmentModal.notesPlaceholder}
            className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#99CC66]/40 focus:border-[#254222]"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-[#CAE4C5]">
          {initialAppointment && onDelete ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handleDeleteClick}
              className="text-[#DC2626] hover:bg-[#FEF2F2] px-3 py-2 rounded-xl text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {t.appointmentModal.deleteBtn}
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#CAE4C5] text-[#254222] rounded-xl text-[13px] font-medium hover:bg-[#F7FAF4] transition-colors cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[#254222] hover:bg-[#1B3219] disabled:opacity-50 text-white rounded-xl text-[13px] font-semibold transition-colors shadow-xs cursor-pointer"
            >
              {submitting ? t.common.saving : t.appointmentModal.saveBtn}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
