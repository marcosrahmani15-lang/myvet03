import React, { useState } from 'react';
import { Receipt, Plus, Search, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { useClinicData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { formatMoneyDzd } from '../i18n';
import { ApiError } from '../services/apiClient';
import type { Invoice, InvoiceStatus, PaymentMethod } from '../types';

export const InvoicingPage: React.FC = () => {
  const { invoices, clients, patients, createInvoice, updateInvoice } = useClinicData();
  const { session } = useAuth();
  const { t, td, language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Tous' | 'Payée' | 'En attente' | 'Devis'>('Tous');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [payModalInvoice, setPayModalInvoice] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('Espèces');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newInv, setNewInv] = useState({
    ownerId: '',
    clientName: '',
    animalId: '',
    patientName: '',
    description: 'Consultation vétérinaire & soins',
    amount: '3500',
    status: 'Payée' as InvoiceStatus,
    paymentMethod: 'Espèces' as PaymentMethod,
  });

  const filtered = invoices.filter((i) => {
    const matchesSearch =
      i.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'Tous' || i.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPaid = invoices
    .filter((i) => i.status === 'Payée')
    .reduce((acc, curr) => acc + curr.amountDzd, 0);
  const totalPending = invoices
    .filter((i) => i.status === 'En attente' || i.status === 'Partielle')
    .reduce((acc, curr) => acc + Math.max(0, curr.amountDzd - curr.paidDzd), 0);

  const handleSelectPatient = (animalId: string) => {
    const pt = patients.find((p) => p.id === animalId);
    if (!pt) {
      setNewInv((prev) => ({ ...prev, animalId: '' }));
      return;
    }
    setNewInv((prev) => ({
      ...prev,
      animalId: pt.id,
      patientName: pt.name,
      ownerId: pt.ownerId,
      clientName: pt.ownerName,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const amountDzd = parseFloat(newInv.amount) || 0;
      await createInvoice({
        ownerId: newInv.ownerId || null,
        clientName: newInv.clientName,
        animalId: newInv.animalId || null,
        patientName: newInv.patientName,
        amountDzd,
        status: newInv.status,
        paymentMethod: newInv.paymentMethod,
        items: [
          {
            description: newInv.description || 'Honoraires vétérinaires',
            quantity: 1,
            unitPriceDzd: amountDzd,
          },
        ],
      });
      setIsModalOpen(false);
      setNewInv({
        ownerId: '',
        clientName: '',
        animalId: '',
        patientName: '',
        description: 'Consultation vétérinaire & soins',
        amount: '3500',
        status: 'Payée',
        paymentMethod: 'Espèces',
      });
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.invoicing.createError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalInvoice) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateInvoice(payModalInvoice.id, {
        status: 'Payée',
        paymentMethod: payMethod,
      });
      setPayModalInvoice(null);
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.invoicing.payError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadInvoice = (inv: Invoice) => {
    const clinic = session.activeClinic;
    const htmlDir = language === 'ar' ? 'rtl' : 'ltr';
    const alignStart = language === 'ar' ? 'right' : 'left';
    const alignEnd = language === 'ar' ? 'left' : 'right';
    const html = `<!doctype html>
<html lang="${language}" dir="${htmlDir}">
<head><meta charset="utf-8"><title>${inv.number} — My Vet</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;color:#254222}
h1{color:#254222}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{border:1px solid #CAE4C5;padding:10px;text-align:${alignStart}}th{background:#CAE4C5;color:#254222}</style>
</head><body>
<h1>${clinic?.name || t.meta.appName}</h1>
<p>${clinic?.address || 'Ouled Fayet, Alger'} — ${clinic?.phone || '0797 63 87 04'}</p>
<hr/>
<h2>${t.invoicing.printDocHeading} ${inv.number} (${td('invoiceStatus', inv.status)})</h2>
<p><strong>${t.invoicing.printDate}</strong> ${inv.dateFormatted}<br/>
<strong>${t.invoicing.printClient}</strong> ${inv.clientName}<br/>
<strong>${t.invoicing.printPatient}</strong> ${inv.patientName}<br/>
<strong>${t.invoicing.printMethod}</strong> ${td('paymentMethod', inv.paymentMethod || 'Espèces')}</p>
<table><thead><tr><th>${t.invoicing.printColItem}</th><th>${t.invoicing.printColQty}</th><th>${t.invoicing.printColUnit}</th><th>${t.invoicing.printColTotal}</th></tr></thead><tbody>
${(inv.items && inv.items.length > 0
  ? inv.items
  : [{ description: t.invoicing.printDefaultLine, quantity: 1, unitPriceDzd: inv.amountDzd, lineTotalDzd: inv.amountDzd }]
)
  .map(
    (it) =>
      `<tr><td>${it.description}</td><td>${it.quantity}</td><td>${formatMoneyDzd(it.unitPriceDzd, language)}</td><td>${formatMoneyDzd(
        it.lineTotalDzd ?? it.quantity * it.unitPriceDzd,
        language
      )}</td></tr>`
  )
  .join('')}
</tbody></table>
<h3 style="text-align:${alignEnd};margin-top:20px">${t.invoicing.printTotalTtc} ${formatMoneyDzd(inv.amountDzd, language)}</h3>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${inv.number}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-[#5E7F52]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.invoicing.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.invoicing.subtitle}
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setIsModalOpen(true);
          }}
          className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.invoicing.newInvoiceBtn}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard title={t.invoicing.kpiCollectedMonth} value={formatMoneyDzd(totalPaid, language)} />
        <StatCard
          title={t.invoicing.kpiPendingPayment}
          value={formatMoneyDzd(totalPending, language)}
          valueColor="text-[#B45309]"
        />
        <StatCard title={t.invoicing.kpiIssuedCount} value={invoices.length} />
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-4 flex flex-col sm:flex-row items-center gap-4 shadow-2xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#5E7F52] absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.invoicing.searchPlaceholder}
            className="w-full ps-10 pe-4 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-[14px] focus:outline-none focus:border-[#254222] focus:bg-white text-[#254222]"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['Tous', 'Payée', 'En attente', 'Devis'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#CAE4C5] text-[#254222] border border-[#99CC66]'
                  : 'bg-white text-[#4A6644] border border-[#CAE4C5] hover:bg-[#F7FAF4]'
              }`}
            >
              {st === 'Tous' ? t.invoicing.filterAll : td('invoiceStatus', st)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-x-auto">
        <table className="w-full text-start text-[13.5px]">
          <thead className="bg-[#F7FAF4] border-b border-[#CAE4C5] text-[12px] font-bold text-[#4A6644] uppercase">
            <tr>
              <th className="py-3 px-5">{t.invoicing.colNumber}</th>
              <th className="py-3 px-5">{t.invoicing.colClientPatient}</th>
              <th className="py-3 px-5">{t.invoicing.colDate}</th>
              <th className="py-3 px-5">{t.invoicing.colTotal}</th>
              <th className="py-3 px-5">{t.invoicing.colStatus}</th>
              <th className="py-3 px-5 text-end">{t.invoicing.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#CAE4C5]">
            {filtered.map((inv) => (
              <tr key={inv.id} className="hover:bg-[#F7FAF4] transition-colors">
                <td className="py-4 px-5 font-bold text-[#254222]">{inv.number}</td>
                <td className="py-4 px-5">
                  <div className="font-semibold text-[#254222]">{inv.clientName}</div>
                  <div className="text-[12px] text-[#4A6644]">{t.invoicing.patientPrefix} {inv.patientName}</div>
                </td>
                <td className="py-4 px-5 text-[#4A6644]">{inv.dateFormatted}</td>
                <td className="py-4 px-5 font-bold text-[#254222]">{formatMoneyDzd(inv.amountDzd, language)}</td>
                <td className="py-4 px-5">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11.5px] font-bold ${
                      inv.status === 'Payée'
                        ? 'bg-[#99CC66]/35 text-[#254222]'
                        : inv.status === 'Devis'
                        ? 'bg-[#CAE4C5] text-[#254222]'
                        : 'bg-[#ECE2B1] text-[#254222]'
                    }`}
                  >
                    {td('invoiceStatus', inv.status)}
                  </span>
                </td>
                <td className="py-4 px-5 text-end space-x-2 whitespace-nowrap">
                  {(inv.status === 'En attente' || inv.status === 'Partielle') && (
                    <button
                      onClick={() => {
                        setPayModalInvoice(inv);
                        setPayMethod(inv.paymentMethod || 'Espèces');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#CAE4C5] hover:bg-[#99CC66] text-[#254222] rounded-lg text-[12px] font-semibold cursor-pointer transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{t.invoicing.collectBtn}</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadInvoice(inv)}
                    className="p-1.5 hover:bg-[#CAE4C5]/50 rounded-lg text-[#4A6644] hover:text-[#254222] cursor-pointer"
                    title={t.invoicing.downloadDocTitle}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Invoice Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t.invoicing.modalNewTitle}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">
              {t.invoicing.selectPatientOptLabel}
            </label>
            <select
              value={newInv.animalId}
              onChange={(e) => handleSelectPatient(e.target.value)}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white text-[#254222]"
            >
              <option value="">{t.invoicing.customEntryOption}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.ownerName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.clientNameLabel}</label>
              <input
                type="text"
                list="myvet-clients-list"
                value={newInv.clientName}
                onChange={(e) => setNewInv({ ...newInv, clientName: e.target.value })}
                placeholder={t.invoicing.clientNamePlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
              <datalist id="myvet-clients-list">
                {clients.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.patientNameLabel}</label>
              <input
                type="text"
                value={newInv.patientName}
                onChange={(e) => setNewInv({ ...newInv, patientName: e.target.value })}
                placeholder={t.invoicing.patientNamePlaceholder}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.actLabel}</label>
            <input
              type="text"
              value={newInv.description}
              onChange={(e) => setNewInv({ ...newInv, description: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.amountDzdLabel}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newInv.amount}
                onChange={(e) => setNewInv({ ...newInv, amount: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none text-[#254222]"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.statusLabel}</label>
              <select
                value={newInv.status}
                onChange={(e) => setNewInv({ ...newInv, status: e.target.value as InvoiceStatus })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white text-[#254222]"
              >
                <option value="Payée">{t.invoicing.statusPaidOption}</option>
                <option value="En attente">{t.invoicing.statusPendingOption}</option>
                <option value="Devis">{t.invoicing.statusQuoteOption}</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.paymentMethodLabel}</label>
              <select
                value={newInv.paymentMethod}
                onChange={(e) => setNewInv({ ...newInv, paymentMethod: e.target.value as PaymentMethod })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white text-[#254222]"
              >
                <option value="Espèces">{td('paymentMethod', 'Espèces')}</option>
                <option value="Carte Bancaire">{td('paymentMethod', 'Carte Bancaire')}</option>
                <option value="Chèque / Virement">{td('paymentMethod', 'Chèque / Virement')}</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.invoicing.generatingBtn : t.invoicing.generateDocBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Mark Invoice Paid Modal */}
      <Modal
        isOpen={!!payModalInvoice}
        onClose={() => setPayModalInvoice(null)}
        title={`${t.invoicing.payModalTitlePrefix} ${payModalInvoice?.number}`}
      >
        <form onSubmit={handleMarkPaid} className="space-y-4">
          <div className="p-3 bg-[#F7FAF4] rounded-xl border border-[#CAE4C5] text-[13px] flex justify-between">
            <span>{t.invoicing.amountDuePrefix} ({payModalInvoice?.clientName}) :</span>
            <strong className="text-[#254222] tabular-nums">
              {formatMoneyDzd((payModalInvoice?.amountDzd || 0) - (payModalInvoice?.paidDzd || 0), language)}
            </strong>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.invoicing.collectionMethodLabel}</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white text-[#254222]"
            >
              <option value="Espèces">{td('paymentMethod', 'Espèces')}</option>
              <option value="Carte Bancaire">{td('paymentMethod', 'Carte Bancaire')}</option>
              <option value="Chèque / Virement">{td('paymentMethod', 'Chèque / Virement')}</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]">
            <button type="button" onClick={() => setPayModalInvoice(null)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.invoicing.validatingBtn : t.invoicing.validatePaymentBtn}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
