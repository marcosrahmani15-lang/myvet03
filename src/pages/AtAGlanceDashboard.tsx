import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  ListTodo,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  ArrowRight,
  BedDouble,
  Check,
  ShoppingBag,
  FileText
} from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { AppointmentModal } from '../components/agenda/AppointmentModal';
import { PrescriptionModal } from '../components/common/PrescriptionModal';
import { Modal } from '../components/common/Modal';
import { GlobalSearchBar } from '../components/common/GlobalSearchBar';
import { REFERENCE_DATE } from '../services/storage';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { formatMoneyDzd, formatLocalizedDate } from '../i18n';
import { Appointment, Task, TaskPriority, TaskCategory, TeamMember } from '../types';

export const AtAGlanceDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, td, language } = useLanguage();
  const {
    appointments,
    tasks,
    stocks,
    patients,
    hospitalizations,
    todayCashSummary,
    loading,
    toggleTaskCompletion,
    adjustStock,
    createTask,
    createAppointment,
    updateAppointment,
    deleteAppointment,
  } = useClinicData();

  const [actionError, setActionError] = useState<string | null>(null);
  const [isAptModalOpen, setIsAptModalOpen] = useState(false);
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    priority: 'Urgente' as TaskPriority,
    category: 'Médicale' as TaskCategory,
    assignedTo: 'Dr. Vétérinaire' as TeamMember,
    dueDate: '2026-08-14'
  });

  // Today's appointments (Reference date: 2026-08-14)
  const todayApts = appointments
    .filter(a => a.date === '2026-08-14')
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const confirmedToday = todayApts.filter(a => a.status === 'Confirmé').length;

  const isOverdue = (task: Task) => {
    if (task.completed) return false;
    const due = new Date(task.dueDate);
    return due < REFERENCE_DATE;
  };

  const pendingTasks = tasks.filter(t => !t.completed);
  const urgentOrOverdueTasks = pendingTasks.filter(t => t.priority === 'Urgente' || isOverdue(t));
  const otherPendingTasks = pendingTasks.filter(t => t.priority !== 'Urgente' && !isOverdue(t));
  const displayedTasks = [...urgentOrOverdueTasks, ...otherPendingTasks].slice(0, 4);

  const lowStockItems = stocks.filter(s => s.quantity <= s.minThreshold);

  const activeHospitalizations = hospitalizations.filter(
    b => b.patientName !== 'Libre' && b.status !== 'Sorti' && b.status !== 'Disponible'
  );

  const featuredPatient = patients[0];
  const todayCashTotalDzd = todayCashSummary?.totalDzd ?? 0;

  const handleToggleTask = async (taskId: string) => {
    setActionError(null);
    try {
      await toggleTaskCompletion(taskId);
    } catch (err: any) {
      setActionError(err?.message || t.dashboard.taskToggleError);
    }
  };

  const handleQuickRestock = async (stockId: string, addQty: number) => {
    setActionError(null);
    try {
      await adjustStock(stockId, addQty, 'Réassort rapide tableau de bord');
    } catch (err: any) {
      setActionError(err?.message || t.dashboard.stockAdjustError);
    }
  };

  const handleSaveAppointment = async (apt: Partial<Appointment>) => {
    if (selectedApt) {
      await updateAppointment(selectedApt.id, apt);
    } else {
      await createAppointment(apt);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const dateObj = new Date(newTaskForm.dueDate);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatted = `${months[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;

    try {
      await createTask({
        title: newTaskForm.title,
        description: newTaskForm.description,
        priority: newTaskForm.priority,
        category: newTaskForm.category,
        assignedTo: newTaskForm.assignedTo,
        dueDate: newTaskForm.dueDate,
        dueDateFormatted: formatted
      });

      setIsTaskModalOpen(false);
      setNewTaskForm({
        title: '',
        description: '',
        priority: 'Urgente',
        category: 'Médicale',
        assignedTo: 'Dr. Vétérinaire',
        dueDate: '2026-08-14'
      });
    } catch (err: any) {
      setActionError(err?.message || t.dashboard.taskCreateError);
    }
  };

  const getInitials = (_name: string) => 'DV';

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <LayoutDashboard className="w-7 h-7 text-[#254222] shrink-0" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.dashboard.title}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#ECE2B1] text-[#254222] border border-[#CAE4C5]">
              <Clock className="w-3.5 h-3.5 text-[#254222]" />
              <span>
                {formatLocalizedDate('2026-08-14', language, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </span>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.dashboard.subtitle}
          </p>
        </div>

        {/* Global Search Bar & Quick Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <GlobalSearchBar className="w-full sm:w-[320px] md:w-[360px]" />

          <div className="flex items-center flex-wrap gap-2.5 self-start sm:self-auto">
            <button
              onClick={() => setIsPrescriptionModalOpen(true)}
              className="bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] border border-[#99CC66] px-3.5 py-2 rounded-xl font-semibold text-[13px] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <FileText className="w-4 h-4 text-[#254222]" />
              <span>{t.dashboard.writePrescriptionBtn}</span>
            </button>

            <button
              onClick={() => {
                setSelectedApt(null);
                setIsAptModalOpen(true);
              }}
              className="bg-[#254222] hover:bg-[#1B3219] text-white px-4 py-2 rounded-xl font-semibold text-[13px] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.dashboard.newAppointmentBtn}</span>
            </button>

            <button
              onClick={() => setIsTaskModalOpen(true)}
              className="bg-white hover:bg-[#F7FAF4] text-[#254222] border border-[#CAE4C5] px-3.5 py-2 rounded-xl font-semibold text-[13px] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <ListTodo className="w-4 h-4 text-[#4A6644]" />
              <span>{t.dashboard.newTaskBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs font-bold underline cursor-pointer"
          >
            {t.common.close}
          </button>
        </div>
      )}

      {/* 4 Key Performance & Alert StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div onClick={() => navigate('/agenda')} className="cursor-pointer group">
          <StatCard
            title={t.dashboard.kpiTodayApts}
            value={loading ? '—' : `${todayApts.length}`}
            className="group-hover:border-[#99CC66] transition-colors"
          />
        </div>

        <div onClick={() => navigate('/taches')} className="cursor-pointer group">
          <StatCard
            title={t.dashboard.kpiUrgentOverdueTasks}
            value={loading ? '—' : urgentOrOverdueTasks.length}
            valueColor={urgentOrOverdueTasks.length > 0 ? 'text-[#DC2626]' : 'text-[#254222]'}
            className="group-hover:border-[#99CC66] transition-colors"
          />
        </div>

        <div onClick={() => navigate('/stocks')} className="cursor-pointer group">
          <StatCard
            title={t.dashboard.kpiCriticalLowStock}
            value={loading ? '—' : lowStockItems.length}
            valueColor={lowStockItems.length > 0 ? 'text-[#DC2626]' : 'text-[#254222]'}
            className="group-hover:border-[#99CC66] transition-colors"
          />
        </div>

        <div onClick={() => navigate('/hospitalisation')} className="cursor-pointer group">
          <StatCard
            title={t.dashboard.kpiHospitalized}
            value={loading ? '—' : activeHospitalizations.length}
            valueColor="text-[#3B5B35]"
            className="group-hover:border-[#99CC66] transition-colors"
          />
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Appointments & Urgent Tasks */}
        <div className="lg:col-span-7 space-y-6">
          {/* Module 1: Daily Appointments */}
          <div className="bg-white rounded-2xl border border-[#CAE4C5] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#CAE4C5] text-[#254222] flex items-center justify-center">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#254222]">
                    {t.dashboard.todayPlanningTitle}
                  </h2>
                  <span className="text-[12px] text-[#4A6644]">
                    {todayApts.length} {t.dashboard.scheduledCountSuffix} ({confirmedToday} {t.dashboard.confirmedCountSuffix})
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate('/agenda')}
                className="text-[12.5px] font-semibold text-[#254222] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t.dashboard.fullAgendaBtn}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>

            <div className="space-y-3">
              {todayApts.map((apt) => {
                const isVaccin = apt.type === 'Vaccin';
                const isUrgence = apt.type === 'Urgence';

                return (
                  <div
                    key={apt.id}
                    onClick={() => {
                      setSelectedApt(apt);
                      setIsAptModalOpen(true);
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isVaccin
                        ? 'bg-[#CAE4C5]/35 border-[#CAE4C5]'
                        : isUrgence
                        ? 'bg-[#FEF2F2] border-[#FECDD3]'
                        : 'bg-[#F7FAF4] border-[#CAE4C5]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full block mt-1.5 ${
                            isVaccin
                              ? 'bg-[#99CC66]'
                              : isUrgence
                              ? 'bg-[#DC2626]'
                              : 'bg-[#254222]'
                          }`}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span
                            dir="ltr"
                            className={`font-mono text-[12.5px] font-bold ${
                              isVaccin ? 'text-[#3B5B35]' : isUrgence ? 'text-[#DC2626]' : 'text-[#254222]'
                            }`}
                          >
                            {apt.startTime} - {apt.endTime}
                          </span>
                          <span className="font-bold text-[14.5px] text-[#254222]">
                            {apt.patientName}
                          </span>
                          <span className="text-[12px] text-[#4A6644]">
                            ({apt.clientName})
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                              isVaccin
                                ? 'bg-[#CAE4C5] text-[#254222]'
                                : isUrgence
                                ? 'bg-red-100 text-red-700'
                                : 'bg-[#ECE2B1] text-[#254222]'
                            }`}
                          >
                            {td('appointmentType', apt.type)}
                          </span>
                        </div>
                        <p className="text-[13px] text-[#254222] font-medium">
                          {apt.reason}
                        </p>
                        {apt.notes && (
                          <p className="text-[11.5px] text-[#4A6644] italic">
                            {apt.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:self-center shrink-0">
                      <div className="text-end">
                        <span className="text-[12px] font-medium text-[#254222] block">
                          {apt.veterinarian}
                        </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            apt.status === 'Confirmé'
                              ? 'text-[#3B5B35]'
                              : 'text-amber-700'
                          }`}
                        >
                          {td('appointmentStatus', apt.status)}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/patients/${apt.patientId}`);
                        }}
                        className="px-2.5 py-1 text-[11.5px] font-semibold bg-white border border-[#CAE4C5] hover:border-[#99CC66] rounded-lg text-[#254222] transition-colors cursor-pointer"
                        title={t.dashboard.openPatientFileTitle}
                      >
                        {t.dashboard.fileBtn}
                      </button>
                    </div>
                  </div>
                );
              })}

              {todayApts.length === 0 && (
                <div className="py-8 text-center text-[#4A6644] text-[13.5px]">
                  {t.dashboard.noAptsToday}
                </div>
              )}
            </div>

            <button
              onClick={() => {
                setSelectedApt(null);
                setIsAptModalOpen(true);
              }}
              className="w-full py-2.5 border border-dashed border-[#CAE4C5] hover:border-[#99CC66] hover:bg-[#CAE4C5]/30 rounded-xl text-[13px] font-semibold text-[#4A6644] hover:text-[#254222] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.dashboard.addSlotTodayBtn}</span>
            </button>
          </div>

          {/* Module 2: Urgent & Overdue Team Tasks */}
          <div className="bg-white rounded-2xl border border-[#CAE4C5] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#254222]">
                    {t.dashboard.priorityTasksTitle}
                  </h2>
                  <span className="text-[12px] text-[#4A6644]">
                    {urgentOrOverdueTasks.length} {t.dashboard.priorityTasksSubtitleSuffix}
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate('/taches')}
                className="text-[12.5px] font-semibold text-[#254222] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t.dashboard.allTasksBtn}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>

            <div className="space-y-3">
              {displayedTasks.map((task) => {
                const overdue = isOverdue(task);

                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-xl border transition-all ${
                      overdue && !task.completed
                        ? 'border-[#FECDD3] bg-[#FEF2F2]/60'
                        : 'border-[#CAE4C5] bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => handleToggleTask(task.id)}
                        className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                          task.completed
                            ? 'bg-[#254222] border-[#254222] text-white'
                            : 'border-[#CAE4C5] hover:border-[#99CC66] bg-white'
                        }`}
                        title={task.completed ? t.dashboard.markIncompleteTitle : t.dashboard.markCompleteTitle}
                      >
                        {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <h4
                            className={`text-[14.5px] font-bold text-[#254222] ${
                              task.completed ? 'line-through text-[#5E7F52]' : ''
                            }`}
                          >
                            {task.title}
                          </h4>

                          {task.priority === 'Urgente' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#FEE2E2] text-[#DC2626]">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{td('taskPriority', 'Urgente')}</span>
                            </span>
                          )}

                          {task.priority === 'Haute' && (
                            <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#ECE2B1] text-[#254222]">
                              {td('taskPriority', 'Haute')}
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#CAE4C5] text-[#254222]">
                            {td('taskCategory', task.category)}
                          </span>

                          {overdue && !task.completed && (
                            <span className="text-[11.5px] font-bold text-[#DC2626]">
                              {t.dashboard.overduePrefix} ({task.dueDateFormatted})
                            </span>
                          )}
                        </div>

                        <p className="text-[13px] text-[#4A6644] leading-relaxed">
                          {task.description}
                        </p>

                        <div className="flex items-center justify-between pt-1 text-[12px] text-[#4A6644]">
                          <div className="flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-[#CAE4C5] text-[#254222] font-bold text-[8.5px] flex items-center justify-center">
                              {getInitials(task.assignedTo)}
                            </span>
                            <span className="font-medium text-[#254222]">{task.assignedTo}</span>
                          </div>

                          <span className="text-[11px] text-[#5E7F52]">
                            {t.dashboard.createdByPrefix} {task.createdBy}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {displayedTasks.length === 0 && (
                <div className="py-6 text-center text-[#254222] text-[13.5px] font-medium flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#99CC66]" />
                  <span>{t.dashboard.allUrgentTasksOk}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Low-Stock Alerts & Inpatients & Quick Access */}
        <div className="lg:col-span-5 space-y-6">
          {/* Module 3: Low-Stock Alerts */}
          <div className="bg-white rounded-2xl border border-[#CAE4C5] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#254222]">
                    {t.dashboard.stockAlertsTitle}
                  </h2>
                  <span className="text-[12px] text-[#DC2626] font-semibold">
                    {lowStockItems.length} {t.dashboard.stockAlertsSubtitleSuffix}
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate('/stocks')}
                className="text-[12.5px] font-semibold text-[#254222] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t.dashboard.pharmacyLink}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>

            <div className="space-y-3">
              {lowStockItems.map((item) => {
                const ratio = item.minThreshold > 0
                  ? Math.min(100, Math.round((item.quantity / item.minThreshold) * 100))
                  : 100;

                return (
                  <div
                    key={item.id}
                    className="p-4 bg-[#FEF2F2]/60 border border-[#FECDD3] rounded-xl space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#DC2626] text-white">
                            {t.dashboard.criticalBadge}
                          </span>
                          <span className="text-[11.5px] font-semibold text-[#4A6644]">
                            {td('inventoryCategory', item.category)}
                          </span>
                        </div>
                        <h4 className="font-bold text-[14px] text-[#254222] mt-0.5">
                          {item.name}
                        </h4>
                        <span className="text-[11.5px] text-[#4A6644]">
                          {t.dashboard.supplierPrefix} {item.supplier}
                        </span>
                      </div>

                      <div className="text-end">
                        <span className="text-[16px] font-extrabold text-[#DC2626] block">
                          {item.quantity} {item.unit}
                        </span>
                        <span className="text-[11px] text-[#4A6644]">
                          {t.dashboard.minThresholdPrefix} {item.minThreshold}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="w-full bg-[#CAE4C5] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#DC2626] h-full rounded-full transition-all"
                          style={{ width: `${Math.max(10, ratio)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-[#4A6644] mt-1 font-medium">
                        <span>{ratio}{t.dashboard.safetyThresholdPctSuffix}</span>
                        <span className="text-[#DC2626] font-semibold">
                          {t.dashboard.missingPrefix} {Math.max(0, item.minThreshold - item.quantity)} {item.unit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#FECDD3]/50">
                      <button
                        onClick={() => handleQuickRestock(item.id, 1)}
                        className="px-2.5 py-1 text-[11.5px] font-semibold bg-white border border-[#CAE4C5] hover:border-[#254222] rounded-lg text-[#254222] transition-colors cursor-pointer"
                      >
                        +1 {item.unit}
                      </button>
                      <button
                        onClick={() => handleQuickRestock(item.id, 10)}
                        className="px-3 py-1 text-[11.5px] font-semibold bg-[#254222] hover:bg-[#1B3219] text-white rounded-lg transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                      >
                        <ShoppingBag className="w-3 h-3" />
                        <span>{t.dashboard.restockPlus10Btn}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {lowStockItems.length === 0 && (
                <div className="py-6 text-center text-[#254222] text-[13px] font-medium flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#99CC66]" />
                  <span>{t.dashboard.allStocksOptimal}</span>
                </div>
              )}
            </div>
          </div>

          {/* Module 4: Live Hospitalized Inpatients Overview */}
          <div className="bg-white rounded-2xl border border-[#CAE4C5] p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#CAE4C5]/70 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#CAE4C5] text-[#254222] flex items-center justify-center">
                  <BedDouble className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#254222]">
                    {t.dashboard.hospitalizedTitle}
                  </h2>
                  <span className="text-[12px] text-[#4A6644]">
                    {t.dashboard.hospitalizedSubtitle}
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate('/hospitalisation')}
                className="text-[12.5px] font-semibold text-[#254222] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t.dashboard.cagesBoardLink}</span>
                <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
              </button>
            </div>

            <div className="space-y-2.5">
              {activeHospitalizations.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  onClick={() => navigate('/hospitalisation')}
                  className="p-3 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl flex items-center justify-between text-[13px] hover:border-[#99CC66] transition-colors cursor-pointer"
                >
                  <div className="space-y-0.5 min-w-0 pe-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[12px] text-[#254222] bg-[#CAE4C5] px-1.5 py-0.5 rounded shrink-0">
                        {item.boxCode}
                      </span>
                      <span className="font-bold text-[#254222] truncate">{item.patientName}</span>
                      <span className="text-[11.5px] text-[#4A6644] truncate">({item.breed || td('species', item.species)})</span>
                    </div>
                    <p className="text-[12px] text-[#4A6644] truncate">{item.reason}</p>
                  </div>

                  <div className="text-end shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold block ${
                      item.status === 'Critique'
                        ? 'bg-rose-100 text-rose-800'
                        : item.status === 'Stable'
                        ? 'bg-[#CAE4C5] text-[#254222]'
                        : 'bg-[#ECE2B1] text-[#254222]'
                    }`}>
                      {td('hospStatus', item.status)}
                    </span>
                    <span className="text-[11px] text-[#5E7F52] mt-0.5 block">{item.veterinarian}</span>
                  </div>
                </div>
              ))}

              {activeHospitalizations.length === 0 && (
                <div className="py-5 text-center text-[13px] text-[#4A6644]">
                  {t.dashboard.noHospitalized}
                </div>
              )}
            </div>
          </div>

          {/* Quick Links Card (Live DZD Cash Closing & Patient Shortcut) */}
          <div className="bg-[#ECE2B1]/50 border border-[#ECE2B1] rounded-2xl p-4.5 space-y-3">
            <h3 className="text-[13.5px] font-bold text-[#254222]">
              {t.dashboard.quickAccessTitle}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate(featuredPatient ? `/patients/${featuredPatient.id}` : '/patients')}
                className="p-2.5 bg-white border border-[#CAE4C5] hover:border-[#99CC66] rounded-xl text-start transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#CAE4C5] flex items-center justify-center text-lg shrink-0">
                  {featuredPatient?.avatarEmoji || '🐾'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[13px] text-[#254222] truncate">
                    {featuredPatient ? featuredPatient.name : t.dashboard.patientsFallback}
                  </div>
                  <div className="text-[11px] text-[#4A6644] truncate">
                    {featuredPatient ? featuredPatient.ownerName : t.dashboard.fullListFallback}
                  </div>
                </div>
              </button>

              <button
                onClick={() => navigate('/cloture-caisse')}
                className="p-2.5 bg-white border border-[#CAE4C5] hover:border-[#99CC66] rounded-xl text-start transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#ECE2B1] text-[#254222] flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[13px] text-[#254222] truncate">{t.dashboard.cashClosingLabel}</div>
                  <div className="text-[11px] text-[#4A6644] truncate tabular-nums">
                    {formatMoneyDzd(todayCashTotalDzd, language)} {t.dashboard.collectedSuffix}
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Appointment Modal */}
      <AppointmentModal
        isOpen={isAptModalOpen}
        onClose={() => setIsAptModalOpen(false)}
        onSave={handleSaveAppointment}
        onDelete={deleteAppointment}
        initialAppointment={selectedApt}
        defaultDate="2026-08-14"
        defaultTime="14:00"
      />

      {/* Official Prescription Modal */}
      <PrescriptionModal
        isOpen={isPrescriptionModalOpen}
        onClose={() => setIsPrescriptionModalOpen(false)}
      />

      {/* Quick Task Creation Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title={t.dashboard.quickTaskModalTitle}
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.dashboard.quickTaskTitleLabel}
            </label>
            <input
              type="text"
              value={newTaskForm.title}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
              placeholder={t.dashboard.quickTaskTitlePlaceholder}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.dashboard.quickTaskDescLabel}
            </label>
            <textarea
              value={newTaskForm.description}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
              rows={3}
              placeholder={t.dashboard.quickTaskDescPlaceholder}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.dashboard.quickTaskPriorityLabel}
              </label>
              <select
                value={newTaskForm.priority}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value as TaskPriority })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              >
                <option value="Urgente">{td('taskPriority', 'Urgente')}</option>
                <option value="Haute">{td('taskPriority', 'Haute')}</option>
                <option value="Normale">{td('taskPriority', 'Normale')}</option>
              </select>
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.dashboard.quickTaskAssigneeLabel}
              </label>
              <select
                value={newTaskForm.assignedTo}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, assignedTo: e.target.value as TeamMember })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              >
                <option value="Dr. Vétérinaire">Dr. Vétérinaire</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button
              type="button"
              onClick={() => setIsTaskModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] cursor-pointer"
            >
              {t.dashboard.quickTaskCreateBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
