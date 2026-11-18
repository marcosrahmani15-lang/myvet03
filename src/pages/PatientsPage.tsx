import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope, Search, Plus, ChevronRight, Phone, User, AlertCircle } from 'lucide-react';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { ApiError } from '../services/apiClient';
import { Patient } from '../types';
import { Modal } from '../components/common/Modal';

export const PatientsPage: React.FC = () => {
  const navigate = useNavigate();
  const { patients, clients, createPatient } = useClinicData();
  const { t, td } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSpecies, setFilterSpecies] = useState<'Tous' | 'Chat' | 'Chien'>('Tous');
  const [isNewPatientModalOpen, setIsNewPatientModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newPatient, setNewPatient] = useState<Partial<Patient>>({
    name: '',
    species: 'Chat',
    breed: '',
    color: '',
    gender: 'Femelle',
    birthDate: '2025-01-01',
    age: '1 an',
    weight: '4 kg',
    microchip: '',
    ownerId: clients[0]?.id || '',
    veterinarian: 'Dr. Vétérinaire',
    status: 'Actif',
    avatarEmoji: '🐱'
  });

  useEffect(() => {
    if (!newPatient.ownerId && clients.length > 0) {
      setNewPatient(prev => ({ ...prev, ownerId: clients[0].id }));
    }
  }, [clients, newPatient.ownerId]);

  const filteredPatients = patients.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.breed.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecies = filterSpecies === 'Tous' || p.species === filterSpecies;
    return matchesSearch && matchesSpecies;
  });

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newPatient.ownerId) {
      setFormError(t.patients.ownerMissingError);
      return;
    }

    setSubmitting(true);
    try {
      const created = await createPatient({
        name: newPatient.name || t.patients.defaultName,
        species: (newPatient.species as any) || 'Chat',
        breed: newPatient.breed || t.patients.defaultBreed,
        color: newPatient.color || '—',
        gender: (newPatient.gender as any) || 'Femelle',
        birthDate: newPatient.birthDate || '2025-01-01',
        age: newPatient.age || t.patients.defaultAge,
        weight: newPatient.weight || '4 kg',
        microchip: newPatient.microchip || '—',
        ownerId: newPatient.ownerId,
        veterinarian: newPatient.veterinarian || 'Dr. Vétérinaire',
        status: 'Actif',
        avatarEmoji: newPatient.species === 'Chien' ? '🐕' : '🐱',
      });

      setIsNewPatientModalOpen(false);
      navigate(`/patients/${created.id}`);
    } catch (err: any) {
      setFormError(err instanceof ApiError ? err.message : t.patients.createError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Stethoscope className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.patients.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.patients.subtitle}
          </p>
        </div>

        <button
          onClick={() => {
            setFormError(null);
            setIsNewPatientModalOpen(true);
          }}
          className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.patients.newPatientBtn}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-4 flex flex-col sm:flex-row items-center gap-4 shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#5E7F52] absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.patients.searchPlaceholder}
            className="w-full ps-10 pe-4 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-[14px] focus:outline-none focus:border-[#254222] focus:bg-white text-[#254222]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {(['Tous', 'Chat', 'Chien'] as const).map((sp) => (
            <button
              key={sp}
              onClick={() => setFilterSpecies(sp)}
              className={`px-3.5 py-1.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                filterSpecies === sp
                  ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66]'
                  : 'bg-white text-[#4A6644] border border-[#CAE4C5] hover:bg-[#F7FAF4]'
              }`}
            >
              {sp === 'Tous' ? t.patients.allSpecies : td('species', sp)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-hidden">
        <div className="divide-y divide-[#CAE4C5]">
          {filteredPatients.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/patients/${p.id}`)}
              className="p-5 flex items-center justify-between hover:bg-[#F7FAF4] transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#CAE4C5]/50 border border-[#99CC66]/50 flex items-center justify-center text-2xl shrink-0 group-hover:scale-105 transition-transform">
                  {p.avatarEmoji || (p.species === 'Chat' ? '🐱' : '🐕')}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[16px] text-[#254222] group-hover:text-[#3B5B35] transition-colors">
                      {p.name}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#CAE4C5] text-[#254222] border border-[#99CC66]/60">
                      {td('patientStatus', p.status)}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#ECE2B1] text-[#254222]">
                      {td('species', p.species)}
                    </span>
                  </div>
                  <div className="flex items-center flex-wrap gap-3 text-[12.5px] text-[#4A6644] mt-1">
                    <span>{t.patients.breedPrefix} <strong className="text-[#254222]">{p.breed}</strong></span>
                    <span>·</span>
                    <span>{t.patients.agePrefix} <strong className="text-[#254222]">{p.age}</strong></span>
                    <span>·</span>
                    <span>{t.patients.weightPrefix} <strong className="text-[#254222]">{p.weight}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="hidden md:flex flex-col text-end">
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#254222] justify-end">
                    <User className="w-3.5 h-3.5 text-[#5E7F52]" />
                    <span>{p.ownerName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-[#4A6644] justify-end">
                    <Phone className="w-3 h-3 text-[#5E7F52]" />
                    <span dir="ltr">{p.ownerPhone}</span>
                  </div>
                </div>

                <div className="w-8 h-8 rounded-lg bg-[#F7FAF4] group-hover:bg-[#CAE4C5] flex items-center justify-center text-[#5E7F52] group-hover:text-[#254222] transition-colors">
                  <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                </div>
              </div>
            </div>
          ))}

          {filteredPatients.length === 0 && (
            <div className="p-12 text-center text-[#4A6644]">
              {t.patients.noPatientsFound}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isNewPatientModalOpen}
        onClose={() => setIsNewPatientModalOpen(false)}
        title={t.patients.modalNewTitle}
      >
        <form onSubmit={handleCreatePatient} className="space-y-4">
          {formError && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[12.5px] text-[#991B1B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.patients.ownerSelectLabel}
            </label>
            <select
              value={newPatient.ownerId}
              onChange={(e) => setNewPatient({ ...newPatient, ownerId: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              required
            >
              <option value="" disabled>{t.patients.selectOwnerPlaceholder}</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-[#DC2626] mt-1">
                {t.patients.noClientsWarning}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.patients.nameLabel}
              </label>
              <input
                type="text"
                value={newPatient.name}
                onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                placeholder={t.patients.namePlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.patients.speciesLabel}
              </label>
              <select
                value={newPatient.species}
                onChange={(e) => setNewPatient({ ...newPatient, species: e.target.value as any })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              >
                <option value="Chat">{td('species', 'Chat')}</option>
                <option value="Chien">{td('species', 'Chien')}</option>
                <option value="Autre">{td('species', 'Autre')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patients.breedLabel}</label>
              <input
                type="text"
                value={newPatient.breed}
                onChange={(e) => setNewPatient({ ...newPatient, breed: e.target.value })}
                placeholder={t.patients.breedPlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patients.genderLabel}</label>
              <select
                value={newPatient.gender}
                onChange={(e) => setNewPatient({ ...newPatient, gender: e.target.value as any })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              >
                <option value="Femelle">{td('gender', 'Femelle')}</option>
                <option value="Mâle">{td('gender', 'Mâle')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patients.weightLabel}</label>
              <input
                type="text"
                value={newPatient.weight}
                onChange={(e) => setNewPatient({ ...newPatient, weight: e.target.value })}
                placeholder={t.patients.weightPlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.patients.ageLabel}</label>
              <input
                type="text"
                value={newPatient.age}
                onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                placeholder={t.patients.agePlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button
              type="button"
              onClick={() => setIsNewPatientModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] text-[#4A6644] rounded-xl text-[13px] font-medium hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting || clients.length === 0}
              className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] cursor-pointer disabled:opacity-50"
            >
              {submitting ? t.patients.creatingBtn : t.patients.createBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
