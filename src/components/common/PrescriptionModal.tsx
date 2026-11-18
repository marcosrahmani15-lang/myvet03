import React, { useState } from 'react';
import { Printer, X, MapPin, Phone, Calendar } from 'lucide-react';
import { MyVetLogo } from './MyVetLogo';
import { Patient } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface PrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient | null;
  initialContent?: string;
}

export const PrescriptionModal: React.FC<PrescriptionModalProps> = ({
  isOpen,
  onClose,
  patient,
  initialContent = ''
}) => {
  const { t } = useLanguage();
  const [species, setSpecies] = useState<'Chien' | 'Chat' | 'Autres'>(
    patient?.species === 'Chien' ? 'Chien' : patient?.species === 'Chat' ? 'Chat' : 'Autres'
  );

  const [date, setDate] = useState('2026-08-14');
  const [prescriptionText, setPrescriptionText] = useState(
    initialContent ||
    `1. Clavaseptin 62.5 mg (Amoxicilline / Acide clavulanique)\n   Posologie : 1 comprimé matin et soir pendant 7 jours, pendant le repas.\n\n2. Meloxidyl 0.5 mg/ml (Anti-inflammatoire)\n   Posologie : 0.5 dose par kg une fois par jour le matin pendant 4 jours.\n\n3. Consignes diététiques :\n   Ration ménagère hyper-digestible, eau fraîche à disposition en permanence.\n   Contrôle clinique sous 5 jours en cas de persistance des symptômes.`
  );

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#254222]/50 backdrop-blur-xs transition-opacity no-print"
        onClick={onClose}
      />

      {/* Modal / Prescription Pad Container */}
      <div className="relative bg-[#FFFFFF] rounded-2xl border-2 border-[#CAE4C5] shadow-2xl max-w-2xl w-full z-10 overflow-hidden flex flex-col my-auto max-h-[95vh]">
        {/* Top Control Bar (Hidden on print) */}
        <div className="px-5 py-3 bg-[#CAE4C5] border-b border-[#99CC66]/50 flex items-center justify-between no-print">
          <div className="flex items-center gap-2 text-[14px] font-bold text-[#254222]">
            <span>{t.prescriptionModal.topBarTitle}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-[#254222] hover:bg-[#1B3219] text-white rounded-xl text-[12.5px] font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t.common.print}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common.close}
              className="p-1.5 text-[#254222]/80 hover:text-[#254222] hover:bg-[#99CC66]/30 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Prescription Paper Pad Body */}
        <div className="p-6 sm:p-8 bg-[#FFFFFF] overflow-y-auto text-[#254222] space-y-5 print:p-0 print:border-none">
          {/* Header Branding */}
          <div className="flex flex-col items-center text-center space-y-1">
            <MyVetLogo variant="full" showSlogan={true} />
            <div className="w-full border-t border-[#CAE4C5] my-2" />
            <h2 className="text-[20px] font-extrabold tracking-[0.14em] text-[#254222] uppercase font-sans">
              {t.prescriptionModal.headingTitle}
            </h2>
          </div>

          {/* Species Radio Selection Bar */}
          <div className="bg-[#CAE4C5]/70 rounded-full px-4 py-2 flex items-center flex-wrap justify-between gap-3 text-[12.5px] font-bold text-[#254222] border border-[#CAE4C5]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#99CC66]" />
              <span>{t.prescriptionModal.speciesPrompt}</span>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="species"
                  checked={species === 'Chien'}
                  onChange={() => setSpecies('Chien')}
                  className="accent-[#254222]"
                />
                <span>{t.prescriptionModal.speciesDog}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="species"
                  checked={species === 'Chat'}
                  onChange={() => setSpecies('Chat')}
                  className="accent-[#254222]"
                />
                <span>{t.prescriptionModal.speciesCat}</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="species"
                  checked={species === 'Autres'}
                  onChange={() => setSpecies('Autres')}
                  className="accent-[#254222]"
                />
                <span>{t.prescriptionModal.speciesOther}</span>
              </label>
            </div>
          </div>

          {/* Patient Details bar */}
          {patient && (
            <div className="px-3 py-1.5 bg-[#ECE2B1]/55 rounded-lg border border-[#ECE2B1] text-[12px] flex flex-wrap items-center justify-between gap-2 text-[#4A6644]">
              <span>{t.prescriptionModal.animalLabel} <strong className="text-[#254222]">{patient.name}</strong> ({patient.breed})</span>
              <span>{t.prescriptionModal.ownerLabel} <strong className="text-[#254222]">{patient.ownerName}</strong> (<span dir="ltr">{patient.ownerPhone}</span>)</span>
              <span>{t.prescriptionModal.weightLabel} <strong className="text-[#254222]">{patient.weight}</strong></span>
            </div>
          )}

          {/* Big Prescription Box with Rx symbol */}
          <div className="relative border-2 border-[#CAE4C5] rounded-2xl p-5 bg-[#FFFFFF] min-h-[260px] shadow-2xs space-y-2">
            <div className="flex items-center gap-2 font-serif text-[28px] font-bold text-[#254222] select-none leading-none">
              <span>R</span>
              <span className="text-[20px]">🐾</span>
            </div>

            <textarea
              value={prescriptionText}
              onChange={(e) => setPrescriptionText(e.target.value)}
              rows={8}
              className="w-full text-[13.5px] leading-relaxed text-[#254222] font-mono bg-transparent border-none focus:outline-none resize-none p-1"
              placeholder={t.prescriptionModal.placeholder}
            />
          </div>

          {/* Footer Coordinates and Doctor Stamp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            {/* Address & Phone Box */}
            <div className="bg-[#CAE4C5]/50 rounded-xl p-3.5 border border-[#CAE4C5] space-y-1.5 text-[12px] text-[#254222]">
              <div className="flex items-center gap-2 font-semibold">
                <MapPin className="w-4 h-4 text-[#254222] shrink-0" />
                <span>Coopérative el moustakbel n° CC3, Ouled Fayet</span>
              </div>
              <div className="flex items-center gap-2 font-bold text-[13px] text-[#254222]">
                <Phone className="w-4 h-4 text-[#254222] shrink-0" />
                <span dir="ltr">0797 63 87 04</span>
              </div>
            </div>

            {/* Date & Signature Stamp */}
            <div className="bg-[#ECE2B1]/55 rounded-xl p-3.5 border border-[#ECE2B1] space-y-2 text-[12px] text-[#254222] flex flex-col justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <Calendar className="w-4 h-4 text-[#254222] shrink-0" />
                <span>{t.prescriptionModal.dateLabel} </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent font-bold border-b border-[#CAE4C5] focus:outline-none text-[12.5px]"
                />
              </div>

              <div className="pt-2 border-t border-[#CAE4C5]/80 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#4A6644]">
                  <span>{t.prescriptionModal.signatureLabel}</span>
                </div>
                <div className="text-end">
                  <span className="font-brand-script text-[17px] text-[#254222] font-bold block leading-none">
                    Dr. Vétérinaire
                  </span>
                  <span className="text-[9px] text-[#4A6644] uppercase tracking-wider block">
                    {t.prescriptionModal.clinicStamp}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
