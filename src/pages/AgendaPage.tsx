import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { AppointmentModal } from '../components/agenda/AppointmentModal';
import { Appointment } from '../types';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { formatLocalizedDate } from '../i18n';

const HOURS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00'
];

interface DayInfo {
  label: string;
  dayNumber: number;
  dateStr: string;
  isCurrentDay?: boolean;
}

export const AgendaPage: React.FC = () => {
  const { appointments, createAppointment, updateAppointment, deleteAppointment } = useClinicData();
  const { t, td, language } = useLanguage();
  const [viewMode, setViewMode] = useState<'Semaine' | 'Jour'>('Semaine');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDayDate, setSelectedDayDate] = useState<string>('2026-08-14');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [slotDate, setSlotDate] = useState<string>('2026-08-14');
  const [slotTime, setSlotTime] = useState<string>('09:00');

  const baseMonday = new Date(2026, 7, 10 + weekOffset * 7);

  const weekDays: DayInfo[] = t.agenda.dayNamesShort.map((label, idx) => {
    const d = new Date(baseMonday);
    d.setDate(baseMonday.getDate() + idx);
    const dayNumber = d.getDate();
    const dateStr = d.toISOString().split('T')[0];
    const isCurrentDay = dateStr === '2026-08-14';
    return { label, dayNumber, dateStr, isCurrentDay };
  });

  const formatMonthRange = () => {
    const start = weekDays[0];
    const end = weekDays[6];
    const endDate = new Date(baseMonday);
    endDate.setDate(baseMonday.getDate() + 6);
    const startM = t.agenda.monthsLong[baseMonday.getMonth()];
    const endM = t.agenda.monthsLong[endDate.getMonth()];
    return `${start.dayNumber} ${startM} — ${end.dayNumber} ${endM} ${endDate.getFullYear()}`;
  };

  const todayApts = appointments.filter(a => a.date === '2026-08-14');
  const weekDateStrs = new Set(weekDays.map(d => d.dateStr));
  const thisWeekApts = appointments.filter(a => weekDateStrs.has(a.date));
  const confirmedWeekApts = thisWeekApts.filter(a => a.status === 'Confirmé');

  const handleSaveAppointment = async (saved: Partial<Appointment>) => {
    if (editingAppointment) {
      await updateAppointment(editingAppointment.id, saved);
    } else {
      await createAppointment(saved);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    await deleteAppointment(id);
  };

  const openNewSlot = (date: string, time: string) => {
    setEditingAppointment(null);
    setSlotDate(date);
    setSlotTime(time);
    setIsModalOpen(true);
  };

  const openEdit = (apt: Appointment, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingAppointment(apt);
    setIsModalOpen(true);
  };

  const getCardStyle = (type: string) => {
    switch (type) {
      case 'Vaccin':
        return {
          bg: 'bg-[#EFF6FF]',
          border: 'border-[#BFDBFE]',
          dot: 'bg-[#2563EB]',
          timeText: 'text-[#2563EB]',
          titleText: 'text-[#1E40AF]'
        };
      case 'Contrôle':
        return {
          bg: 'bg-[#ECE2B1]/60',
          border: 'border-[#ECE2B1]',
          dot: 'bg-[#99CC66]',
          timeText: 'text-[#3B5B35]',
          titleText: 'text-[#254222]'
        };
      case 'Urgence':
        return {
          bg: 'bg-[#FEF2F2]',
          border: 'border-[#FECDD3]',
          dot: 'bg-[#DC2626]',
          timeText: 'text-[#DC2626]',
          titleText: 'text-[#991B1B]'
        };
      case 'Consultation':
      default:
        return {
          bg: 'bg-[#CAE4C5]/50',
          border: 'border-[#99CC66]/60',
          dot: 'bg-[#254222]',
          timeText: 'text-[#254222]',
          titleText: 'text-[#254222]'
        };
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <CalendarDays className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.agenda.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.agenda.subtitle}
          </p>
        </div>

        <button
          onClick={() => {
            setEditingAppointment(null);
            setSlotDate('2026-08-14');
            setSlotTime('09:00');
            setIsModalOpen(true);
          }}
          className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.agenda.newAppointmentBtn}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard title={t.agenda.kpiToday} value={todayApts.length} />
        <StatCard title={t.agenda.kpiThisWeek} value={thisWeekApts.length} />
        <StatCard title={t.agenda.kpiConfirmed} value={confirmedWeekApts.length} valueColor="text-[#254222]" />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="w-8 h-8 flex items-center justify-center bg-white border border-[#CAE4C5] hover:bg-[#F7FAF4] rounded-lg text-[#4A6644] transition-colors cursor-pointer"
            title={t.agenda.prevWeekTitle}
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>

          <button
            onClick={() => {
              setWeekOffset(0);
              setSelectedDayDate('2026-08-14');
            }}
            className="px-3.5 py-1.5 bg-white border border-[#CAE4C5] hover:bg-[#F7FAF4] text-[13px] font-semibold text-[#254222] rounded-lg transition-colors cursor-pointer"
          >
            {t.agenda.todayBtn}
          </button>

          <button
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="w-8 h-8 flex items-center justify-center bg-white border border-[#CAE4C5] hover:bg-[#F7FAF4] rounded-lg text-[#4A6644] transition-colors cursor-pointer"
            title={t.agenda.nextWeekTitle}
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </button>

          <span className="ms-2 text-[15px] font-bold text-[#254222]">
            {formatMonthRange()}
          </span>
        </div>

        <div className="flex items-center p-1 bg-white border border-[#CAE4C5] rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setViewMode('Jour')}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
              viewMode === 'Jour'
                ? 'bg-[#CAE4C5] text-[#254222]'
                : 'text-[#4A6644] hover:text-[#254222]'
            }`}
          >
            {t.agenda.dayViewBtn}
          </button>
          <button
            onClick={() => setViewMode('Semaine')}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
              viewMode === 'Semaine'
                ? 'bg-[#CAE4C5] text-[#254222]'
                : 'text-[#4A6644] hover:text-[#254222]'
            }`}
          >
            {t.agenda.weekViewBtn}
          </button>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-4 text-[13px] text-[#4A6644] pt-0.5">
        <span className="font-semibold text-[#254222]">{t.agenda.legendLabel}</span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
          <span>{td('appointmentType', 'Urgence')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#254222]" />
          <span>{td('appointmentType', 'Consultation')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
          <span>{td('appointmentType', 'Vaccin')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#99CC66]" />
          <span>{td('appointmentType', 'Contrôle')}</span>
        </div>
      </div>

      {viewMode === 'Semaine' ? (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[72px_repeat(7,1fr)] border-b border-[#CAE4C5] bg-white">
                <div className="p-3 border-e border-[#CAE4C5]/70" />
                {weekDays.map((d) => (
                  <div
                    key={d.dateStr}
                    onClick={() => {
                      setSelectedDayDate(d.dateStr);
                      setViewMode('Jour');
                    }}
                    className={`py-3 text-center cursor-pointer transition-colors border-e border-[#CAE4C5]/70 last:border-e-0 ${
                      d.isCurrentDay ? 'bg-[#ECE2B1]/55' : 'hover:bg-[#F7FAF4]'
                    }`}
                  >
                    <span className="block text-[11px] font-bold text-[#4A6644] tracking-wider uppercase">
                      {d.label}
                    </span>
                    <span
                      className="text-[17px] font-bold leading-tight block mt-0.5 text-[#254222]"
                    >
                      {d.dayNumber}
                    </span>
                  </div>
                ))}
              </div>

              <div className="divide-y divide-[#CAE4C5]">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="grid grid-cols-[72px_repeat(7,1fr)] min-h-[76px]"
                  >
                    <div className="p-2.5 text-[12px] font-semibold text-[#5E7F52] border-e border-[#CAE4C5]/70 select-none flex items-start justify-center">
                      {hour}
                    </div>

                    {weekDays.map((d) => {
                      const slotApts = appointments.filter(
                        a => a.date === d.dateStr && a.startTime.startsWith(hour.slice(0, 2))
                      );

                      return (
                        <div
                          key={d.dateStr + hour}
                          onClick={() => openNewSlot(d.dateStr, hour)}
                          className={`p-1.5 border-e border-[#CAE4C5]/70 last:border-e-0 relative group transition-colors cursor-pointer ${
                            d.isCurrentDay ? 'bg-[#ECE2B1]/20' : 'hover:bg-[#F7FAF4]/60'
                          }`}
                        >
                          {slotApts.map((apt) => {
                            const style = getCardStyle(apt.type);
                            return (
                              <div
                                key={apt.id}
                                onClick={(e) => openEdit(apt, e)}
                                className={`${style.bg} ${style.border} border rounded-lg p-2 transition-transform hover:scale-[1.01] shadow-2xs mb-1`}
                              >
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={`w-2 h-2 rounded-full ${style.dot} shrink-0`} />
                                  <span className={`text-[11.5px] font-bold ${style.timeText}`}>
                                    {apt.startTime}
                                  </span>
                                </div>
                                <div
                                  className="text-[12.5px] font-semibold text-[#254222] truncate leading-tight"
                                  title={apt.reason}
                                >
                                  {apt.reason}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-4">
            <div>
              <span className="text-[12px] font-bold text-[#3B5B35] uppercase tracking-wider">
                {t.agenda.dailyViewEyebrow}
              </span>
              <h2 className="text-[20px] font-bold text-[#254222]">
                {selectedDayDate === '2026-08-14'
                  ? t.agenda.todayRefLabel
                  : formatLocalizedDate(selectedDayDate, language, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
              </h2>
            </div>
            <button
              onClick={() => openNewSlot(selectedDayDate, '09:00')}
              className="px-3.5 py-1.5 bg-[#CAE4C5] text-[#254222] border border-[#99CC66] rounded-xl text-[13px] font-semibold hover:bg-[#99CC66] transition-colors cursor-pointer"
            >
              {t.agenda.addSlotBtn}
            </button>
          </div>

          <div className="divide-y divide-[#CAE4C5]">
            {HOURS.map((hour) => {
              const dayApts = appointments.filter(
                a => a.date === selectedDayDate && a.startTime.startsWith(hour.slice(0, 2))
              );
              return (
                <div key={hour} className="py-3 flex items-start gap-6 group hover:bg-[#F7FAF4] px-3 rounded-xl transition-colors">
                  <span className="w-16 text-[13px] font-semibold text-[#4A6644] pt-1">
                    {hour}
                  </span>
                  <div className="flex-1">
                    {dayApts.length > 0 ? (
                      <div className="space-y-2">
                        {dayApts.map(apt => {
                          const style = getCardStyle(apt.type);
                          return (
                            <div
                              key={apt.id}
                              onClick={(e) => openEdit(apt, e)}
                              className={`${style.bg} ${style.border} border rounded-xl p-3 cursor-pointer flex items-center justify-between shadow-2xs`}
                            >
                              <div className="flex items-center gap-3">
                                <span className={`w-3 h-3 rounded-full ${style.dot}`} />
                                <div>
                                  <span className={`text-[12px] font-bold ${style.timeText}`}>
                                    <span dir="ltr">{apt.startTime} - {apt.endTime}</span> · {td('appointmentType', apt.type)}
                                  </span>
                                  <h4 className="font-bold text-[14px] text-[#254222]">
                                    {apt.reason} — {t.agenda.patientPrefix} {apt.patientName} ({apt.clientName})
                                  </h4>
                                  {apt.notes && (
                                    <p className="text-[12px] text-[#4A6644] mt-0.5">{apt.notes}</p>
                                  )}
                                </div>
                              </div>
                              <span className="text-[12px] px-2.5 py-1 rounded-full font-medium bg-white/80 border border-[#CAE4C5] text-[#254222]">
                                {apt.veterinarian}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <button
                        onClick={() => openNewSlot(selectedDayDate, hour)}
                        className="text-[12.5px] text-[#5E7F52] hover:text-[#254222] font-medium py-1 transition-colors cursor-pointer"
                      >
                        {t.agenda.freeSlotBtn}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AppointmentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveAppointment}
        onDelete={handleDeleteAppointment}
        initialAppointment={editingAppointment}
        defaultDate={slotDate}
        defaultTime={slotTime}
      />
    </div>
  );
};
