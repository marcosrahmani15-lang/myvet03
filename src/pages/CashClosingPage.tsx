import React, { useState, useEffect, useCallback } from 'react';
import { CreditCard, CheckCircle2, Printer, Calendar, AlertTriangle, History } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { api, ApiError } from '../services/apiClient';
import { useClinicData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatMoneyDzd } from '../i18n';
import type { CashClosingSummary } from '../types';

export const CashClosingPage: React.FC = () => {
  const { refreshAll } = useClinicData();
  const { session } = useAuth();
  const { language, t, td } = useLanguage();
  const [selectedDate, setSelectedDate] = useState('2026-08-14');
  const [summary, setSummary] = useState<CashClosingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close day modal
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('0');
  const [countedCb, setCountedCb] = useState('0');
  const [countedCheck, setCountedCheck] = useState('0');
  const [closingNotes, setClosingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadSummary = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<CashClosingSummary>(`/api/cash-closings?date=${encodeURIComponent(date)}`);
      setSummary(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : t.cashClosing.loadError);
    } finally {
      setLoading(false);
    }
  }, [t.cashClosing.loadError]);

  useEffect(() => {
    loadSummary(selectedDate);
  }, [selectedDate, loadSummary]);

  const openCloseModal = () => {
    if (summary) {
      setCountedCash(String(summary.cashDzd));
      setCountedCb(String(summary.cbDzd));
      setCountedCheck(String(summary.checkTransferDzd));
    }
    setClosingNotes('');
    setIsCloseModalOpen(true);
  };

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<CashClosingSummary>('/api/cash-closings', {
        closingDate: selectedDate,
        countedCashDzd: parseFloat(countedCash) || 0,
        countedCbDzd: parseFloat(countedCb) || 0,
        countedCheckTransferDzd: parseFloat(countedCheck) || 0,
        notes: closingNotes,
      });
      setSummary(res);
      setIsCloseModalOpen(false);
      await refreshAll();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : t.cashClosing.closeError);
    } finally {
      setSubmitting(false);
    }
  };

  const expectedCountedTotal =
    (parseFloat(countedCash) || 0) + (parseFloat(countedCb) || 0) + (parseFloat(countedCheck) || 0);
  const previewVariance = summary ? expectedCountedTotal - summary.expectedDzd : 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-[#5E7F52]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.cashClosing.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.cashClosing.subtitle}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white border border-[#CAE4C5] rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar className="w-4 h-4 text-[#4A6644]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-[13px] font-semibold text-[#254222] bg-transparent focus:outline-none"
            />
          </div>

          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-white border border-[#CAE4C5] text-[#254222] text-[13px] font-semibold rounded-xl hover:bg-[#F7FAF4] transition-colors flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#4A6644]" />
            <span>{t.cashClosing.printJournalBtn}</span>
          </button>

          <button
            onClick={openCloseModal}
            disabled={!summary || summary.isClosed}
            className={`px-5 py-2 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center gap-1.5 shadow-xs ${
              summary?.isClosed
                ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66] cursor-default'
                : 'bg-[#254222] hover:bg-[#1B3219] text-white cursor-pointer'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{summary?.isClosed ? t.cashClosing.dayClosedBtn : t.cashClosing.closeDayBtn}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title={t.cashClosing.kpiCardTotal}
          value={loading ? '—' : formatMoneyDzd(summary?.cbDzd || 0, language)}
        />
        <StatCard
          title={t.cashClosing.kpiCashTotal}
          value={loading ? '—' : formatMoneyDzd(summary?.cashDzd || 0, language)}
        />
        <StatCard
          title={t.cashClosing.kpiCheckTransferTotal}
          value={loading ? '—' : formatMoneyDzd(summary?.checkTransferDzd || 0, language)}
        />
        <StatCard
          title={t.cashClosing.kpiDayTotal}
          value={loading ? '—' : formatMoneyDzd(summary?.totalDzd || 0, language)}
          valueColor="text-[#5E7F52]"
        />
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#CAE4C5] pb-4">
          <div>
            <h3 className="text-[17px] font-bold text-[#254222]">
              {t.cashClosing.journalTitlePrefix} {selectedDate}
            </h3>
            <span className="text-[13px] text-[#4A6644]">
              {t.cashClosing.operatorPrefix} {summary?.operatorName || session.user?.fullName || 'My Vet'} ({session.activeClinic?.name || 'My Vet'})
            </span>
          </div>
          <span
            className={`px-3 py-1 font-bold text-[12px] rounded-full border self-start sm:self-auto tabular-nums ${
              (summary?.varianceDzd || 0) === 0
                ? 'bg-[#CAE4C5] text-[#254222] border-[#99CC66]/60'
                : 'bg-[#ECE2B1] text-[#254222] border-[#99CC66]/50'
            }`}
          >
            {summary?.isClosed
              ? `${t.cashClosing.closedBadgePrefix} (${t.cashClosing.varianceWord} ${formatMoneyDzd(summary.varianceDzd, language)})`
              : `${t.cashClosing.balancedBadgePrefix} (${t.cashClosing.varianceWord} ${formatMoneyDzd(summary?.varianceDzd || 0, language)})`}
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[13px] text-[#4A6644]">{t.cashClosing.loadingJournal}</div>
        ) : !summary || summary.entries.length === 0 ? (
          <div className="py-8 text-center text-[13px] text-[#5E7F52]">
            {t.cashClosing.noEntriesForDatePrefix} {selectedDate}.
          </div>
        ) : (
          <div className="space-y-3">
            {summary.entries.map((op) => (
              <div
                key={op.id}
                className="p-3.5 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-mono text-[12px] text-[#5E7F52] shrink-0">{op.time}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-[13.5px] text-[#254222] truncate">
                      {op.clientName} — {op.patientName}
                      {op.invoiceNumber && (
                        <span className="ms-2 font-mono text-[11px] font-normal text-[#4A6644]">
                          ({op.invoiceNumber})
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-[#4A6644] truncate">{op.description}</div>
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <div className="font-bold text-[14px] text-[#254222] tabular-nums">{formatMoneyDzd(op.amountDzd, language)}</div>
                  <div className="text-[11.5px] text-[#4A6644]">{td('paymentMethod', op.paymentMethod)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History of closed days */}
      {summary && summary.history && summary.history.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-[#CAE4C5] pb-3">
            <History className="w-5 h-5 text-[#5E7F52]" />
            <h3 className="text-[16px] font-bold text-[#254222]">{t.cashClosing.historyTitle}</h3>
          </div>
          <div className="divide-y divide-[#CAE4C5]">
            {summary.history.map((h) => (
              <div key={h.id} className="py-3 flex items-center justify-between text-[13px]">
                <div>
                  <span className="font-bold text-[#254222] tabular-nums">{h.closingDate}</span>
                  <span className="text-[#4A6644] ms-3">{t.cashClosing.operatorPrefix} {h.operatorName}</span>
                </div>
                <div className="text-end tabular-nums">
                  <span className="font-bold text-[#254222]">{formatMoneyDzd(h.totalDzd, language)}</span>
                  <span className="text-[11.5px] text-[#4A6644] ms-3">
                    ({t.cashClosing.varianceHistoryPrefix} {formatMoneyDzd(h.varianceDzd, language)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title={`${t.cashClosing.closeModalTitlePrefix} ${selectedDate}`}
      >
        <form onSubmit={handleCloseDay} className="space-y-4">
          <div className="p-3 bg-[#F7FAF4] rounded-xl border border-[#CAE4C5] text-[13px] flex items-center justify-between">
            <span className="text-[#4A6644]">{t.cashClosing.expectedTotalLabel}</span>
            <strong className="text-[#254222] tabular-nums">{formatMoneyDzd(summary?.expectedDzd || 0, language)}</strong>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[12.5px] font-semibold text-[#254222] mb-1">
                {t.cashClosing.countedCashLabel}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-[#254222] mb-1">
                {t.cashClosing.countedCardLabel}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={countedCb}
                onChange={(e) => setCountedCb(e.target.value)}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-[#254222] mb-1">
                {t.cashClosing.countedCheckLabel}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={countedCheck}
                onChange={(e) => setCountedCheck(e.target.value)}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
          </div>

          <div className="p-3 bg-[#ECE2B1]/60 rounded-xl border border-[#ECE2B1] text-[13px] flex items-center justify-between">
            <span className="font-semibold text-[#254222]">{t.cashClosing.varianceObservedLabel}</span>
            <span
              className={`font-bold tabular-nums ${
                Math.abs(previewVariance) < 0.01 ? 'text-[#254222]' : 'text-[#B45309]'
              }`}
            >
              {formatMoneyDzd(previewVariance, language)}
            </span>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.cashClosing.notesLabel}
            </label>
            <textarea
              rows={2}
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder={t.cashClosing.notesPlaceholder}
              className="w-full px-3 py-2 text-[13.5px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button
              type="button"
              onClick={() => setIsCloseModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? t.cashClosing.validatingBtn : t.cashClosing.confirmCloseBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
