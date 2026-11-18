import React, { useState } from 'react';
import { BedDouble, Plus, ClipboardPlus, LogOut, AlertTriangle } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { ApiError } from '../services/apiClient';
import type { HospitalizationBox, HospitalizationStatus } from '../types';

export const HospitalizationPage: React.FC = () => {
  const { hospitalizations, patients, createHospitalization, updateHospitalization } = useClinicData();
  const { t, td } = useLanguage();

  const [isAdmitOpen, setIsAdmitOpen] = useState(false);
  const [careTarget, setCareTarget] = useState<HospitalizationBox | null>(null);
  const [dischargeTarget, setDischargeTarget] = useState<HospitalizationBox | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [admitForm, setAdmitForm] = useState({
    boxCode: 'Box H4',
    animalId: '',
    patientName: '',
    species: 'Chat',
    breed: 'Européen',
    ownerName: '',
    reason: '',
    veterinarian: 'Dr. Vétérinaire',
    status: 'Stable' as HospitalizationStatus,
    diet: 'Alimentation thérapeutique',
  });

  const [careNote, setCareNote] = useState('');
  const [careStatus, setCareStatus] = useState<HospitalizationStatus>('Stable');

  const isOccupied = (b: HospitalizationBox) =>
    b.status !== 'Disponible' && b.status !== 'Sorti' && b.patientName !== 'Libre';

  const occupiedCount = hospitalizations.filter(isOccupied).length;
  const availableCount = hospitalizations.filter((b) => !isOccupied(b)).length;
  const criticalCount = hospitalizations.filter((b) => b.status === 'Critique').length;
  const careLogsCount = hospitalizations.reduce((sum, b) => sum + (b.careLogs?.length || 0), 0);

  const handleSelectPatientForAdmit = (animalId: string) => {
    const p = patients.find((pt) => pt.id === animalId);
    if (!p) {
      setAdmitForm((prev) => ({ ...prev, animalId: '', patientName: '', ownerName: '' }));
      return;
    }
    setAdmitForm((prev) => ({
      ...prev,
      animalId: p.id,
      patientName: p.name,
      species: p.species,
      breed: p.breed,
      ownerName: p.ownerName,
      veterinarian: p.veterinarian || 'Dr. Vétérinaire',
    }));
  };

  const handleAdmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const selected = patients.find((p) => p.id === admitForm.animalId);
      await createHospitalization({
        boxCode: admitForm.boxCode,
        animalId: admitForm.animalId || null,
        ownerId: selected?.ownerId || null,
        patientName: admitForm.patientName,
        species: admitForm.species,
        breed: admitForm.breed,
        ownerName: admitForm.ownerName,
        reason: admitForm.reason,
        veterinarian: admitForm.veterinarian,
        status: admitForm.status,
        diet: admitForm.diet,
      });
      setIsAdmitOpen(false);
      setAdmitForm({
        boxCode: `Box H${hospitalizations.length + 1}`,
        animalId: '',
        patientName: '',
        species: 'Chat',
        breed: 'Européen',
        ownerName: '',
        reason: '',
        veterinarian: 'Dr. Vétérinaire',
        status: 'Stable',
        diet: 'Alimentation thérapeutique',
      });
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.hospitalization.admitError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!careTarget || !careNote.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateHospitalization(careTarget.id, {
        careNote: careNote.trim(),
        status: careStatus,
      });
      setCareTarget(null);
      setCareNote('');
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.hospitalization.careError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDischarge = async () => {
    if (!dischargeTarget) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateHospitalization(dischargeTarget.id, { discharge: true });
      setDischargeTarget(null);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.hospitalization.dischargeError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BedDouble className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.hospitalization.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.hospitalization.subtitle}
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setIsAdmitOpen(true);
          }}
          className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.hospitalization.admitPatientBtn}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
        <StatCard title={t.hospitalization.kpiOccupied} value={occupiedCount} />
        <StatCard title={t.hospitalization.kpiAvailable} value={availableCount} />
        <StatCard title={t.hospitalization.kpiCritical} value={criticalCount} valueColor="text-[#DC2626]" />
        <StatCard title={t.hospitalization.kpiCareLogs} value={careLogsCount} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {hospitalizations.map((b) => {
          const isFree = !isOccupied(b);
          return (
            <div
              key={b.id}
              className={`bg-white rounded-2xl border p-5 shadow-2xs space-y-3 ${
                b.status === 'Critique'
                  ? 'border-[#FECDD3] bg-[#FFFBFB]'
                  : 'border-[#CAE4C5]'
              }`}
            >
              <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[16px] text-[#254222]">{b.boxCode}</span>
                  {!isFree && (
                    <span className="font-bold text-[16px] text-[#3B5B35]">
                      — {b.patientName} ({td('species', b.species)})
                    </span>
                  )}
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isFree
                      ? 'bg-[#ECE2B1] text-[#254222]'
                      : b.status === 'Critique'
                      ? 'bg-rose-100 text-rose-700'
                      : b.status === 'Stable'
                      ? 'bg-[#CAE4C5] text-[#254222]'
                      : 'bg-[#99CC66]/35 text-[#254222] border border-[#99CC66]/60'
                  }`}
                >
                  {isFree ? t.hospitalization.availableBadge : td('hospStatus', b.status)}
                </span>
              </div>

              {!isFree ? (
                <div className="space-y-3 text-[13px]">
                  <div>
                    <span className="text-[#5E7F52] uppercase text-[11px] font-bold block">{t.hospitalization.reasonLabel}</span>
                    <p className="font-semibold text-[#254222]">{b.reason}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[12.5px] text-[#4A6644]">
                    <div>{t.hospitalization.ownerPrefix} <strong className="text-[#254222]">{b.ownerName}</strong></div>
                    <div>{t.hospitalization.vetPrefix} <strong className="text-[#254222]">{b.veterinarian}</strong></div>
                  </div>

                  <div className="p-3 bg-[#F7FAF4] rounded-xl border border-[#CAE4C5] text-[12px] space-y-1">
                    <div><strong>{t.hospitalization.dietPrefix}</strong> {b.diet}</div>
                    <div className="text-[#4A6644]"><strong>{t.hospitalization.lastCarePrefix}</strong> {b.lastCare}</div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setCareTarget(b);
                        setCareStatus(b.status);
                        setCareNote('');
                      }}
                      className="px-3 py-1.5 bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] rounded-xl text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <ClipboardPlus className="w-3.5 h-3.5" />
                      <span>{t.hospitalization.addCareBtn}</span>
                    </button>
                    <button
                      onClick={() => setDischargeTarget(b)}
                      className="px-3 py-1.5 bg-white border border-[#CAE4C5] hover:bg-[#F7FAF4] text-[#4A6644] rounded-xl text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t.hospitalization.dischargeBtn}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-[#5E7F52] text-[13px]">
                  {b.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Admit Modal */}
      <Modal isOpen={isAdmitOpen} onClose={() => setIsAdmitOpen(false)} title={t.hospitalization.admitModalTitle}>
        <form onSubmit={handleAdmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.boxLabel}</label>
              <input
                type="text"
                value={admitForm.boxCode}
                onChange={(e) => setAdmitForm({ ...admitForm, boxCode: e.target.value })}
                placeholder={t.hospitalization.boxPlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.registeredPatientLabel}</label>
              <select
                value={admitForm.animalId}
                onChange={(e) => handleSelectPatientForAdmit(e.target.value)}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              >
                <option value="">{t.hospitalization.selectOrCustomPlaceholder}</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({td('species', p.species)}) — {p.ownerName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.patientNameLabel}</label>
              <input
                type="text"
                value={admitForm.patientName}
                onChange={(e) => setAdmitForm({ ...admitForm, patientName: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.ownerLabel}</label>
              <input
                type="text"
                value={admitForm.ownerName}
                onChange={(e) => setAdmitForm({ ...admitForm, ownerName: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.admitReasonLabel}</label>
            <input
              type="text"
              value={admitForm.reason}
              onChange={(e) => setAdmitForm({ ...admitForm, reason: e.target.value })}
              placeholder={t.hospitalization.admitReasonPlaceholder}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.clinicalStatusLabel}</label>
              <select
                value={admitForm.status}
                onChange={(e) => setAdmitForm({ ...admitForm, status: e.target.value as HospitalizationStatus })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              >
                <option value="Stable">{td('hospStatus', 'Stable')}</option>
                <option value="Critique">{td('hospStatus', 'Critique')}</option>
                <option value="En convalescence">{td('hospStatus', 'En convalescence')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.dietLabel}</label>
              <input
                type="text"
                value={admitForm.diet}
                onChange={(e) => setAdmitForm({ ...admitForm, diet: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button type="button" onClick={() => setIsAdmitOpen(false)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.common.saving : t.hospitalization.admitSubmitBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Care Note Modal */}
      <Modal
        isOpen={!!careTarget}
        onClose={() => setCareTarget(null)}
        title={`${t.hospitalization.careModalTitlePrefix} ${careTarget?.boxCode} (${careTarget?.patientName})`}
      >
        <form onSubmit={handleAddCare} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.newStatusLabel}</label>
            <select
              value={careStatus}
              onChange={(e) => setCareStatus(e.target.value as HospitalizationStatus)}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
            >
              <option value="Critique">{td('hospStatus', 'Critique')}</option>
              <option value="Stable">{td('hospStatus', 'Stable')}</option>
              <option value="En convalescence">{td('hospStatus', 'En convalescence')}</option>
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.hospitalization.careNoteLabel}</label>
            <textarea
              rows={3}
              value={careNote}
              onChange={(e) => setCareNote(e.target.value)}
              placeholder={t.hospitalization.careNotePlaceholder}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button type="button" onClick={() => setCareTarget(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.common.saving : t.hospitalization.careSaveBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Discharge Confirmation Modal */}
      <Modal
        isOpen={!!dischargeTarget}
        onClose={() => setDischargeTarget(null)}
        title={t.hospitalization.dischargeModalTitle}
      >
        <div className="space-y-4">
          <p className="text-[13.5px] text-[#4A6644]">
            {t.hospitalization.dischargeConfirmPrefix} <strong className="text-[#254222]">{dischargeTarget?.patientName}</strong> {t.hospitalization.dischargeConfirmMid}{' '}
            <strong className="text-[#254222]">{dischargeTarget?.boxCode}</strong> {t.hospitalization.dischargeConfirmSuffix}
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button type="button" onClick={() => setDischargeTarget(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="button" onClick={handleDischarge} disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.hospitalization.validatingBtn : t.hospitalization.dischargeSubmitBtn}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
