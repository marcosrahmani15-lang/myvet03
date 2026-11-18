import React, { useState } from 'react';
import {
  ListTodo,
  RotateCw,
  Plus,
  AlertTriangle,
  FileText,
  Stethoscope,
  MessageSquare,
  ChevronDown,
  Check,
  Send
} from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { Task, TaskPriority, TaskCategory, TeamMember } from '../types';
import { REFERENCE_DATE } from '../services/storage';
import { useClinicData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export const TeamTasksPage: React.FC = () => {
  const { session } = useAuth();
  const { t, td } = useLanguage();
  const {
    tasks,
    loading,
    refreshAll,
    createTask,
    updateTask,
    toggleTaskCompletion,
    addTaskComment,
  } = useClinicData();

  const currentUserName = session.user?.fullName || 'Dr. Vétérinaire';

  const [selectedTeamMember, setSelectedTeamMember] = useState<string>("Toute l'équipe");
  const [statusFilter, setStatusFilter] = useState<'À faire' | 'Mes tâches' | 'Toutes' | 'Terminées'>('À faire');
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState<{
    title: string;
    description: string;
    priority: TaskPriority;
    category: TaskCategory;
    assignedTo: TeamMember;
    dueDate: string;
  }>({
    title: '',
    description: '',
    priority: 'Normale',
    category: 'Médicale',
    assignedTo: 'Dr. Vétérinaire',
    dueDate: '2026-08-15'
  });

  const isOverdue = (task: Task) => {
    if (task.completed) return false;
    const due = new Date(task.dueDate);
    return due < REFERENCE_DATE;
  };

  const pendingTasks = tasks.filter(t => !t.completed);
  const myTasks = tasks.filter(t => !t.completed && t.assignedTo === currentUserName);
  const overdueTasks = tasks.filter(t => isOverdue(t));
  const urgentTasks = tasks.filter(t => !t.completed && t.priority === 'Urgente');

  const vetCount = pendingTasks.filter(t => t.assignedTo === 'Dr. Vétérinaire').length;

  const filteredTasks = tasks.filter(t => {
    if (statusFilter === 'À faire' && t.completed) return false;
    if (statusFilter === 'Terminées' && !t.completed) return false;
    if (statusFilter === 'Mes tâches' && (t.completed || t.assignedTo !== currentUserName)) return false;

    if (selectedTeamMember !== "Toute l'équipe" && t.assignedTo !== selectedTeamMember) {
      return false;
    }

    return true;
  });

  const handleToggleTask = async (id: string) => {
    setActionError(null);
    try {
      await toggleTaskCompletion(id);
    } catch (err: any) {
      setActionError(err?.message || t.tasks.updateError);
    }
  };

  const handleAssignChange = async (taskId: string, newAssignee: TeamMember) => {
    setActionError(null);
    try {
      await updateTask(taskId, { assignedTo: newAssignee });
    } catch (err: any) {
      setActionError(err?.message || t.tasks.assignError);
    }
  };

  const toggleComments = (taskId: string) => {
    setExpandedComments(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleAddComment = async (taskId: string) => {
    const text = newCommentText[taskId];
    if (!text || !text.trim()) return;
    setActionError(null);
    try {
      await addTaskComment(taskId, text.trim());
      setNewCommentText(prev => ({ ...prev, [taskId]: '' }));
    } catch (err: any) {
      setActionError(err?.message || t.tasks.commentError);
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
        createdBy: currentUserName,
        dueDate: newTaskForm.dueDate,
        dueDateFormatted: formatted
      });

      setIsNewTaskModalOpen(false);
      setNewTaskForm({
        title: '',
        description: '',
        priority: 'Normale',
        category: 'Médicale',
        assignedTo: 'Dr. Vétérinaire',
        dueDate: '2026-08-15'
      });
    } catch (err: any) {
      setActionError(err?.message || t.tasks.createError);
    }
  };

  const getInitials = (_name: string) => 'DV';

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <ListTodo className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.tasks.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.tasks.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={() => refreshAll()}
            disabled={loading}
            className="px-4 py-2 bg-white border border-[#CAE4C5] text-[#254222] text-[13px] font-semibold rounded-xl hover:bg-[#F7FAF4] transition-colors flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
          >
            <RotateCw className={`w-4 h-4 text-[#4A6644] ${loading ? 'animate-spin' : ''}`} />
            <span>{t.tasks.refreshBtn}</span>
          </button>

          <button
            onClick={() => setIsNewTaskModalOpen(true)}
            className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.tasks.newTaskBtn}</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs font-bold underline cursor-pointer">{t.common.close}</button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard title={t.tasks.kpiPending} value={pendingTasks.length} />
        <StatCard title={t.tasks.kpiMyTasks} value={myTasks.length} valueColor="text-[#254222]" />
        <StatCard title={t.tasks.kpiOverdue} value={overdueTasks.length} valueColor="text-[#D97706]" />
        <StatCard title={t.tasks.kpiUrgent} value={urgentTasks.length} valueColor="text-[#DC2626]" />
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-5 shadow-2xs space-y-3">
        <span className="block text-[13.5px] font-bold text-[#254222]">
          {t.tasks.teamSectionTitle}
        </span>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => setSelectedTeamMember("Toute l'équipe")}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
              selectedTeamMember === "Toute l'équipe"
                ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66]'
                : 'bg-white text-[#4A6644] border border-[#CAE4C5] hover:bg-[#F7FAF4]'
            }`}
          >
            {t.tasks.allTeamBtn}
          </button>

          <button
            onClick={() => setSelectedTeamMember('Dr. Vétérinaire')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
              selectedTeamMember === 'Dr. Vétérinaire'
                ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66]'
                : 'bg-white text-[#4A6644] border border-[#CAE4C5] hover:bg-[#F7FAF4]'
            }`}
          >
            <div className="relative">
              <span className="w-6 h-6 rounded-full bg-[#CAE4C5] text-[#254222] font-bold text-[10px] flex items-center justify-center">
                DV
              </span>
              {vetCount > 0 && (
                <span className="absolute -top-1 -end-1.5 w-4 h-4 rounded-full bg-[#99CC66] text-[#254222] text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                  {vetCount}
                </span>
              )}
            </div>
            <span>Dr. Vétérinaire</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(['À faire', 'Mes tâches', 'Toutes', 'Terminées'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
              statusFilter === filter
                ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66]'
                : 'bg-white text-[#4A6644] border border-[#CAE4C5] hover:bg-[#F7FAF4]'
            }`}
          >
            {filter === 'À faire'
              ? t.tasks.filterTodo
              : filter === 'Mes tâches'
              ? t.tasks.filterMine
              : filter === 'Toutes'
              ? t.tasks.filterAll
              : t.tasks.filterDone}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredTasks.map((task) => {
          const overdue = isOverdue(task);
          const isExpanded = !!expandedComments[task.id];

          return (
            <div
              key={task.id}
              className={`bg-white rounded-2xl border p-5 transition-all shadow-2xs ${
                overdue && !task.completed
                  ? 'border-[#FECDD3] bg-[#FEF2F2]/60'
                  : 'border-[#CAE4C5]'
              }`}
            >
              <div className="flex items-start gap-4">
                <button
                  onClick={() => handleToggleTask(task.id)}
                  className={`mt-1 w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                    task.completed
                      ? 'bg-[#254222] border-[#254222] text-white'
                      : 'border-[#CAE4C5] hover:border-[#99CC66] bg-white'
                  }`}
                  title={task.completed ? t.tasks.markIncompleteTitle : t.tasks.markCompleteTitle}
                >
                  {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </button>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center flex-wrap gap-2">
                    <h3
                      className={`text-[15.5px] font-bold text-[#254222] ${
                        task.completed ? 'line-through text-[#5E7F52]' : ''
                      }`}
                    >
                      {task.title}
                    </h3>

                    {task.priority === 'Urgente' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FEE2E2] text-[#DC2626]">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{td('taskPriority', 'Urgente')}</span>
                      </span>
                    )}
                    {task.priority === 'Haute' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#ECE2B1] text-[#254222]">
                        <span>{td('taskPriority', 'Haute')}</span>
                      </span>
                    )}
                    {task.priority === 'Normale' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#CAE4C5]/70 text-[#254222]">
                        <span>{td('taskPriority', 'Normale')}</span>
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#F7FAF4] border border-[#CAE4C5] text-[#254222]">
                      {task.category === 'Médicale' ? (
                        <Stethoscope className="w-3 h-3 text-[#254222]" />
                      ) : (
                        <FileText className="w-3 h-3 text-[#4A6644]" />
                      )}
                      <span>{td('taskCategory', task.category)}</span>
                    </span>

                    {overdue && (
                      <span className="text-[12px] font-semibold text-[#DC2626] ms-1">
                        {t.tasks.overdueBadge}
                      </span>
                    )}
                  </div>

                  <p className="text-[13.5px] text-[#4A6644] leading-relaxed">
                    {task.description}
                  </p>

                  <div className="flex items-center flex-wrap gap-2 text-[12.5px] text-[#4A6644]">
                    <span>
                      {t.tasks.duePrefix} <strong className="text-[#254222]">{task.dueDateFormatted}</strong>
                    </span>
                    <span className="text-[#CAE4C5]">·</span>
                    <span>
                      {t.tasks.createdByPrefix} <strong className="text-[#254222]">{task.createdBy}</strong>
                    </span>
                  </div>

                  <div className="flex items-center flex-wrap gap-4 pt-1">
                    <div className="relative inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#CAE4C5] rounded-lg text-[13px] shadow-2xs">
                      <span className="w-5 h-5 rounded-full bg-[#CAE4C5] text-[#254222] font-bold text-[9px] flex items-center justify-center">
                        {getInitials(task.assignedTo)}
                      </span>
                      <select
                        value={task.assignedTo}
                        onChange={(e) => handleAssignChange(task.id, e.target.value as TeamMember)}
                        className="bg-transparent font-medium text-[#254222] text-[13px] focus:outline-none cursor-pointer pe-4"
                      >
                        <option value="Dr. Vétérinaire">Dr. Vétérinaire</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-[#5E7F52] pointer-events-none absolute end-2" />
                    </div>

                    <button
                      onClick={() => toggleComments(task.id)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#4A6644] hover:text-[#254222] transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-[#5E7F52]" />
                      <span>{task.comments?.length || 0} {t.tasks.commentsSuffix}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[#5E7F52] transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-[#CAE4C5]/70 space-y-3">
                      {task.comments && task.comments.length > 0 ? (
                        <div className="space-y-2">
                          {task.comments.map((c) => (
                            <div
                              key={c.id}
                              className="bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl p-3 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[11.5px] text-[#5E7F52]">
                                <span className="font-semibold text-[#254222]">{c.author}</span>
                                <span>{c.date}</span>
                              </div>
                              <p className="text-[12.5px] text-[#4A6644]">{c.text}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-[#5E7F52] italic">
                          {t.tasks.noCommentsYet}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newCommentText[task.id] || ''}
                          onChange={(e) =>
                            setNewCommentText(prev => ({ ...prev, [task.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddComment(task.id);
                            }
                          }}
                          placeholder={t.tasks.commentPlaceholder}
                          className="flex-1 px-3 py-1.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-[13px] focus:outline-none focus:border-[#254222] focus:bg-white"
                        />
                        <button
                          onClick={() => handleAddComment(task.id)}
                          className="px-3 py-1.5 bg-[#254222] text-white rounded-xl text-[12px] font-semibold hover:bg-[#1B3219] flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>{t.tasks.publishBtn}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredTasks.length === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-[#CAE4C5] text-[#4A6644]">
            {t.tasks.noTasksFound}
          </div>
        )}
      </div>

      <Modal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        title={t.tasks.modalNewTitle}
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.tasks.titleLabel}
            </label>
            <input
              type="text"
              value={newTaskForm.title}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
              placeholder={t.tasks.titlePlaceholder}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:border-[#254222]"
              required
            />
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.tasks.descLabel}
            </label>
            <textarea
              value={newTaskForm.description}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
              rows={3}
              placeholder={t.tasks.descPlaceholder}
              className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:outline-none focus:border-[#254222]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.tasks.priorityLabel}
              </label>
              <select
                value={newTaskForm.priority}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value as TaskPriority })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              >
                <option value="Normale">{td('taskPriority', 'Normale')}</option>
                <option value="Haute">{td('taskPriority', 'Haute')}</option>
                <option value="Urgente">{td('taskPriority', 'Urgente')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.tasks.categoryLabel}
              </label>
              <select
                value={newTaskForm.category}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, category: e.target.value as TaskCategory })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              >
                <option value="Médicale">{td('taskCategory', 'Médicale')}</option>
                <option value="Administrative">{td('taskCategory', 'Administrative')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.tasks.assigneeLabel}
              </label>
              <select
                value={newTaskForm.assignedTo}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, assignedTo: e.target.value as TeamMember })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              >
                <option value="Dr. Vétérinaire">Dr. Vétérinaire</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">
                {t.tasks.dueDateLabel}
              </label>
              <input
                type="date"
                value={newTaskForm.dueDate}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, dueDate: e.target.value })}
                className="w-full px-3 py-2 text-[14px] bg-white border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button
              type="button"
              onClick={() => setIsNewTaskModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] text-[#4A6644] rounded-xl text-[13px] font-medium hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-medium hover:bg-[#1B3219] cursor-pointer"
            >
              {t.tasks.createBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
