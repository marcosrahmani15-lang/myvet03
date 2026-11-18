import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  User,
  ChevronRight,
  Phone,
  Sparkles,
} from 'lucide-react';
import { useClinicData } from '../../context/DataContext';
import { useLanguage } from '../../context/LanguageContext';
import { Patient, Client } from '../../types';

interface GlobalSearchBarProps {
  className?: string;
  placeholder?: string;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({
  className = '',
  placeholder
}) => {
  const navigate = useNavigate();
  const { patients, clients } = useClinicData();
  const { t, td } = useLanguage();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'patients' | 'clients'>('all');

  const resolvedPlaceholder = placeholder || t.search.placeholder;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const cleanQuery = query.trim().toLowerCase();

  // Search logic
  const matchedPatients = cleanQuery === '' ? [] : patients.filter(p => {
    return (
      p.name.toLowerCase().includes(cleanQuery) ||
      p.id.toLowerCase().includes(cleanQuery) ||
      p.ownerName.toLowerCase().includes(cleanQuery) ||
      p.ownerPhone.includes(cleanQuery) ||
      p.breed.toLowerCase().includes(cleanQuery) ||
      p.species.toLowerCase().includes(cleanQuery) ||
      p.microchip.toLowerCase().includes(cleanQuery)
    );
  });

  const matchedClients = cleanQuery === '' ? [] : clients.filter(c => {
    return (
      c.name.toLowerCase().includes(cleanQuery) ||
      c.id.toLowerCase().includes(cleanQuery) ||
      c.phone.includes(cleanQuery) ||
      c.email.toLowerCase().includes(cleanQuery) ||
      c.address.toLowerCase().includes(cleanQuery)
    );
  });

  const showPatients = filterType === 'all' || filterType === 'patients';
  const showClients = filterType === 'all' || filterType === 'clients';

  const displayedPatients = showPatients ? matchedPatients : [];
  const displayedClients = showClients ? matchedClients : [];

  const totalResultsCount = displayedPatients.length + displayedClients.length;

  const handleSelectPatient = (patient: Patient) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/patients/${patient.id}`);
  };

  const handleSelectClient = (client: Client) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/clients?search=${encodeURIComponent(client.name)}`);
  };

  const highlightMatch = (text: string, search: string) => {
    if (!search) return text;
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-[#ECE2B1] text-[#254222] font-bold rounded px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div ref={containerRef} className={`relative w-full max-w-xl ${className}`}>
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-[#5E7F52] absolute start-3.5 pointer-events-none shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder={resolvedPlaceholder}
          className="w-full ps-10 pe-20 py-2 sm:py-2.5 bg-white text-[#254222] border border-[#CAE4C5] rounded-xl text-xs sm:text-sm font-medium placeholder-[#4A6644]/60 shadow-2xs focus:outline-none focus:border-[#254222] focus:ring-2 focus:ring-[#99CC66]/30 transition-all"
        />

        <div className="absolute end-2.5 flex items-center gap-1.5">
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-md text-[#4A6644] hover:text-[#254222] hover:bg-[#F7FAF4] transition-colors cursor-pointer"
              aria-label={t.search.clearAria}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-bold text-[#4A6644] bg-[#F7FAF4] border border-[#CAE4C5] rounded-md shadow-2xs">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          )}
        </div>
      </div>

      {/* Dropdown Results Overlay */}
      {isOpen && (
        <div className="absolute top-full start-0 end-0 mt-2 bg-white border border-[#CAE4C5] rounded-2xl shadow-xl z-50 overflow-hidden animate-fadeIn">
          {/* Filter Pills Header */}
          <div className="p-3 bg-[#F7FAF4] border-b border-[#CAE4C5] flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-[#254222] text-white shadow-2xs'
                    : 'bg-white text-[#4A6644] hover:bg-[#CAE4C5] border border-[#CAE4C5]'
                }`}
              >
                {t.search.allCount} ({matchedPatients.length + matchedClients.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('patients')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filterType === 'patients'
                    ? 'bg-[#254222] text-white shadow-2xs'
                    : 'bg-white text-[#4A6644] hover:bg-[#CAE4C5] border border-[#CAE4C5]'
                }`}
              >
                <span>🐾 {t.search.patientsLabel}</span>
                <span>({matchedPatients.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterType('clients')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  filterType === 'clients'
                    ? 'bg-[#254222] text-white shadow-2xs'
                    : 'bg-white text-[#4A6644] hover:bg-[#CAE4C5] border border-[#CAE4C5]'
                }`}
              >
                <span>👤 {t.search.clientsLabel}</span>
                <span>({matchedClients.length})</span>
              </button>
            </div>

            <span className="text-[11px] text-[#4A6644] font-medium hidden sm:inline">
              {t.search.escToClose}
            </span>
          </div>

          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#CAE4C5]/70">
            {cleanQuery === '' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#4A6644]">
                  <Sparkles className="w-3.5 h-3.5 text-[#99CC66]" />
                  <span>{t.search.quickSuggestions}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {patients.slice(0, 4).map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPatient(p)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F7FAF4] hover:bg-[#CAE4C5] border border-[#CAE4C5] text-xs font-semibold text-[#254222] transition-colors cursor-pointer"
                    >
                      <span>{p.avatarEmoji || '🐾'}</span>
                      <span>{p.name}</span>
                      <span className="font-mono text-[10px] text-[#5E7F52]">#{p.id}</span>
                    </button>
                  ))}
                  {clients.slice(0, 3).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectClient(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ECE2B1]/50 hover:bg-[#CAE4C5] border border-[#CAE4C5] text-xs font-semibold text-[#254222] transition-colors cursor-pointer"
                    >
                      <User className="w-3 h-3 text-[#254222]" />
                      <span>{c.name}</span>
                      <span className="font-mono text-[10px] text-[#4A6644]">#{c.id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cleanQuery !== '' && totalResultsCount > 0 && (
              <div className="p-2 space-y-3">
                {displayedPatients.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#254222] flex items-center justify-between">
                      <span>{t.search.patientsLabel} ({displayedPatients.length})</span>
                      <span className="text-[10px] lowercase font-normal">{t.search.directMedicalRecord}</span>
                    </div>

                    <div className="space-y-1">
                      {displayedPatients.map((patient) => (
                        <div
                          key={patient.id}
                          onClick={() => handleSelectPatient(patient)}
                          className="p-2.5 rounded-xl hover:bg-[#F7FAF4] transition-colors cursor-pointer flex items-center justify-between gap-3 group border border-transparent hover:border-[#99CC66]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[#CAE4C5] text-lg flex items-center justify-center shrink-0 border border-[#99CC66]/60">
                              {patient.avatarEmoji || (patient.species === 'Chien' ? '🐶' : '🐱')}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-[#254222]">
                                  {highlightMatch(patient.name, cleanQuery)}
                                </span>
                                <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-[#CAE4C5] text-[#254222] font-semibold border border-[#99CC66]/50">
                                  #{patient.id}
                                </span>
                                <span className="text-[11px] px-2 py-0.2 rounded-full font-medium bg-[#ECE2B1]/70 text-[#254222] border border-[#ECE2B1]">
                                  {td('species', patient.species)} &bull; {patient.breed}
                                </span>
                              </div>

                              <div className="text-xs text-[#4A6644] mt-0.5 truncate flex items-center gap-2">
                                <span>
                                  {t.search.ownerPrefix} <strong className="text-[#254222]">{highlightMatch(patient.ownerName, cleanQuery)}</strong>
                                </span>
                                {patient.ownerPhone && (
                                  <>
                                    <span>&bull;</span>
                                    <span dir="ltr">{highlightMatch(patient.ownerPhone, cleanQuery)}</span>
                                  </>
                                )}
                                {patient.microchip && patient.microchip !== '—' && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="font-mono text-[10px]">{t.search.microchipPrefix} {highlightMatch(patient.microchip, cleanQuery)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold text-[#254222] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform flex items-center">
                              {t.search.viewRecord} <ChevronRight className="w-4 h-4 ms-0.5 rtl:rotate-180" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {displayedClients.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#254222] flex items-center justify-between">
                      <span>{t.search.clientsLabel} ({displayedClients.length})</span>
                      <span className="text-[10px] lowercase font-normal">{t.search.clientRecord}</span>
                    </div>

                    <div className="space-y-1">
                      {displayedClients.map((client) => (
                        <div
                          key={client.id}
                          onClick={() => handleSelectClient(client)}
                          className="p-2.5 rounded-xl hover:bg-[#F7FAF4] transition-colors cursor-pointer flex items-center justify-between gap-3 group border border-transparent hover:border-[#99CC66]"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-[#ECE2B1]/70 text-[#254222] flex items-center justify-center shrink-0 border border-[#ECE2B1]">
                              <User className="w-4 h-4" />
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-[#254222]">
                                  {highlightMatch(client.name, cleanQuery)}
                                </span>
                                <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-[#CAE4C5] text-[#254222] font-semibold border border-[#99CC66]/50">
                                  #{client.id}
                                </span>
                                <span className="text-[11px] px-2 py-0.2 rounded-full font-medium bg-[#ECE2B1]/70 text-[#254222]">
                                  {client.animalsCount} {t.search.animalsCountSuffix}
                                </span>
                              </div>

                              <div className="text-xs text-[#4A6644] mt-0.5 truncate flex items-center gap-2">
                                <span className="flex items-center gap-1" dir="ltr">
                                  <Phone className="w-3 h-3 text-[#5E7F52]" />
                                  <span>{highlightMatch(client.phone, cleanQuery)}</span>
                                </span>
                                {client.email && (
                                  <>
                                    <span>&bull;</span>
                                    <span>{highlightMatch(client.email, cleanQuery)}</span>
                                  </>
                                )}
                                {client.address && (
                                  <>
                                    <span>&bull;</span>
                                    <span className="truncate max-w-[200px]">{client.address}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold text-[#254222] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition-transform flex items-center">
                              {t.search.viewClient} <ChevronRight className="w-4 h-4 ms-0.5 rtl:rotate-180" />
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {cleanQuery !== '' && totalResultsCount === 0 && (
              <div className="p-8 text-center space-y-2">
                <Search className="w-8 h-8 text-[#5E7F52] mx-auto opacity-60" />
                <p className="text-sm font-bold text-[#254222]">
                  {t.search.noMatchTitle}
                </p>
                <p className="text-xs text-[#4A6644] max-w-sm mx-auto">
                  {t.search.noMatchDescPrefix} <strong className="text-[#254222]">{query}</strong> {t.search.noMatchDescSuffix}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
