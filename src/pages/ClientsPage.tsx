import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertCircle,
  Archive,
  Pencil
} from 'lucide-react';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { api, ApiError } from '../services/apiClient';
import { Client } from '../types';
import { Modal } from '../components/common/Modal';
import { formatAlgerianPhone } from '../utils/phoneUtils';
import { calculateClientSmsSegments } from '../utils/smsCalc';

export const ClientsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { clients, createClient, updateClient, archiveClient } = useClinicData();
  const { t, td } = useLanguage();

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || '');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    preferredLanguage: 'fr' as 'fr' | 'ar',
    smsConsent: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submittingClient, setSubmittingClient] = useState(false);

  // SMS Dispatch Modal
  const [selectedClientForSms, setSelectedClientForSms] = useState<Client | null>(null);
  const [smsMessage, setSmsMessage] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsFeedback, setSmsFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.includes(searchTerm) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingClient(null);
    setClientForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      preferredLanguage: 'fr',
      smsConsent: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setClientForm({
      name: client.name,
      phone: client.phone,
      email: client.email || '',
      address: client.address || '',
      preferredLanguage: client.preferredLanguage || 'fr',
      smsConsent: client.smsConsent !== false,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmittingClient(true);
    try {
      if (editingClient) {
        await updateClient(editingClient.id, clientForm);
        setStatusNotice(`${t.clients.updatedNoticePrefix} ${clientForm.name} ${t.clients.updatedNoticeSuffix}`);
      } else {
        await createClient(clientForm);
        setStatusNotice(`${t.clients.createdNoticePrefix} ${clientForm.name} ${t.clients.createdNoticeSuffix}`);
      }
      setIsModalOpen(false);
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err: any) {
      setFormError(err instanceof ApiError ? err.message : t.clients.saveError);
    } finally {
      setSubmittingClient(false);
    }
  };

  const handleArchiveClient = async (client: Client) => {
    if (!window.confirm(`${t.clients.archiveConfirmPrefix} ${client.name} ?`)) return;
    try {
      const res = await archiveClient(client.id);
      setStatusNotice(res.reason || `${client.name}`);
      setTimeout(() => setStatusNotice(null), 4000);
    } catch (err: any) {
      setStatusNotice(err?.message || t.clients.archiveError);
    }
  };

  const openSmsModal = (client: Client) => {
    setSelectedClientForSms(client);
    setSmsMessage(
      `${t.clients.defaultSmsGreeting} ${client.name}, ${t.clients.defaultSmsMiddle} ${t.clients.defaultSmsFooter}`
    );
    setSmsFeedback(null);
  };

  const handleSendManualSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientForSms) return;
    setIsSendingSms(true);
    setSmsFeedback(null);

    try {
      const res = await api.post<{
        success: boolean;
        isSimulated: boolean;
        status: string;
        phone: { e164: string };
      }>('/api/sms/test', {
        phone: selectedClientForSms.phone,
        recipientName: selectedClientForSms.name,
        ownerId: selectedClientForSms.id,
        category: 'MANUAL',
        message: smsMessage,
      });

      setSmsFeedback({
        ok: true,
        text: res.isSimulated
          ? `${t.clients.smsSimulatedPrefix} ${selectedClientForSms.name} (${res.phone.e164}) ${t.clients.smsSimulatedSuffix}`
          : `${t.clients.smsSentPrefix} ${selectedClientForSms.name} (${res.phone.e164}) · ${t.clients.smsStatusWord} ${res.status}.`,
      });
      setTimeout(() => {
        setIsSendingSms(false);
        setSelectedClientForSms(null);
      }, 1800);
    } catch (err: any) {
      setSmsFeedback({
        ok: false,
        text: err instanceof ApiError ? err.message : t.clients.smsSendError,
      });
      setIsSendingSms(false);
    }
  };

  const smsCalc = calculateClientSmsSegments(smsMessage);

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.clients.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.clients.subtitle}
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t.clients.newClientBtn}</span>
        </button>
      </div>

      {statusNotice && (
        <div className="p-3.5 bg-[#CAE4C5]/60 border border-[#99CC66] rounded-xl text-[13px] text-[#254222] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[#254222] shrink-0" />
          <span>{statusNotice}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-4 flex items-center gap-4 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#5E7F52] absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.clients.searchPlaceholder}
            className="w-full ps-10 pe-4 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-[14px] focus:outline-none focus:border-[#254222] focus:bg-white text-[#254222]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-hidden divide-y divide-[#CAE4C5]">
        {filtered.map((client) => {
          const phoneData = formatAlgerianPhone(client.phone);

          return (
            <div key={client.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#F7FAF4] transition-colors">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[16px] text-[#254222]">{client.name}</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#CAE4C5] text-[#254222]">
                    {client.animalsCount} {t.clients.animalsCountSuffix}
                  </span>

                  <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${
                    phoneData.carrier === 'Ooredoo' ? 'bg-[#ED1C24]/10 text-[#ED1C24] border border-[#ED1C24]/20' :
                    phoneData.carrier === 'Mobilis' ? 'bg-[#008542]/10 text-[#008542] border border-[#008542]/20' :
                    phoneData.carrier === 'Djezzy' ? 'bg-[#E30613]/10 text-[#E30613] border border-[#E30613]/20' :
                    'bg-[#ECE2B1] text-[#254222]'
                  }`}>
                    {phoneData.carrier}
                  </span>

                  {client.smsConsent === false && (
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[#ECE2B1] text-[#254222] border border-[#99CC66]/50">
                      {t.clients.smsDisabledBadge}
                    </span>
                  )}

                  <span dir="ltr" className="text-[11px] font-mono text-[#5E7F52] hidden sm:inline">
                    {phoneData.e164}
                  </span>
                </div>

                <div className="flex items-center flex-wrap gap-4 text-[13px] text-[#4A6644]">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#5E7F52]" />
                    <span dir="ltr">{phoneData.national}</span>
                  </span>
                  {client.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#5E7F52]" />
                      {client.email}
                    </span>
                  )}
                  {client.address && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#5E7F52]" />
                      {client.address}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto flex-wrap">
                <button
                  onClick={() => openSmsModal(client)}
                  className="px-3.5 py-1.5 bg-[#254222] hover:bg-[#1B3219] text-white text-[12px] font-semibold rounded-lg flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t.clients.smsReminderBtn}</span>
                </button>

                <button
                  onClick={() => {
                    const clean = client.phone.replace(/\D/g, '');
                    window.open(`https://wa.me/213${clean.replace(/^0/, '')}`, '_blank');
                  }}
                  className="px-3 py-1.5 bg-[#22C55E] hover:bg-[#16A34A] text-white text-[12px] font-semibold rounded-lg flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
                >
                  <span>{t.clients.whatsappBtn}</span>
                </button>

                <button
                  onClick={() => openEditModal(client)}
                  title={t.clients.editClientTitle}
                  className="p-1.5 border border-[#CAE4C5] bg-white hover:bg-[#CAE4C5] text-[#4A6644] hover:text-[#254222] rounded-lg cursor-pointer transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleArchiveClient(client)}
                  title={t.clients.archiveClientTitle}
                  className="p-1.5 border border-[#CAE4C5] bg-white hover:bg-[#FEF2F2] text-[#4A6644] hover:text-[#DC2626] rounded-lg cursor-pointer transition-colors"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-10 text-center text-[#4A6644] text-[13.5px]">
            {t.clients.noClientsFound}
          </div>
        )}
      </div>

      {/* Manual SMS Composer Modal */}
      {selectedClientForSms && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedClientForSms(null)}
          title={`${t.clients.smsModalTitlePrefix} ${selectedClientForSms.name}`}
        >
          <form onSubmit={handleSendManualSms} className="space-y-4">
            <div className="p-3 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#4A6644]">{t.clients.recipientPhoneLabel}</span>
                <span dir="ltr" className="font-mono font-bold text-[#254222]">
                  {formatAlgerianPhone(selectedClientForSms.phone).e164}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#4A6644]">{t.clients.algeriaCarrierLabel}</span>
                <span className="font-bold text-[#254222]">
                  {formatAlgerianPhone(selectedClientForSms.phone).carrier}
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[13px] font-semibold text-[#254222]">
                  {t.clients.smsContentLabel}
                </label>
                <span className="text-[11px] font-bold text-[#3B5B35]">
                  {smsCalc.encoding} · {smsCalc.charCount} ({smsCalc.segments} SMS)
                </span>
              </div>
              <textarea
                rows={4}
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                className="w-full p-3 text-[13.5px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none font-mono"
                required
              />
              <p className="text-[11.5px] text-[#4A6644] mt-1">
                {t.clients.charsRemainingPrefix} {smsCalc.remainingInSegment} {t.clients.charsRemainingSuffix}
              </p>
            </div>

            {smsFeedback && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                smsFeedback.ok
                  ? 'bg-[#CAE4C5]/60 border-[#99CC66] text-[#254222]'
                  : 'bg-[#FEF2F2] border-[#FECDD3] text-[#991B1B]'
              }`}>
                {smsFeedback.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-[#254222] shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
                )}
                <span>{smsFeedback.text}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
              <button
                type="button"
                onClick={() => setSelectedClientForSms(null)}
                className="px-4 py-2 border border-[#CAE4C5] text-[#4A6644] rounded-xl text-[13px] hover:bg-[#F7FAF4] cursor-pointer"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={isSendingSms}
                className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingSms ? t.clients.sendingSmsBtn : t.clients.sendSmsBtn}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create / Edit Client Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingClient ? `${t.clients.modalEditTitlePrefix} ${editingClient.name}` : t.clients.modalNewTitle}
      >
        <form onSubmit={handleSaveClient} className="space-y-4">
          {formError && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[12.5px] text-[#991B1B] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.clients.fullNameLabel}</label>
            <input
              type="text"
              value={clientForm.name}
              onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.clients.phoneLabel}</label>
              <input
                type="text"
                dir="ltr"
                placeholder={t.clients.phonePlaceholder}
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.clients.emailLabel}</label>
              <input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.clients.addressLabel}</label>
            <input
              type="text"
              placeholder={t.clients.addressPlaceholder}
              value={clientForm.address}
              onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
              className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.clients.smsLangLabel}</label>
              <select
                value={clientForm.preferredLanguage}
                onChange={(e) => setClientForm({ ...clientForm, preferredLanguage: e.target.value as 'fr' | 'ar' })}
                className="w-full px-3 py-2 text-[14px] border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              >
                <option value="fr">{td('smsClientLang', 'fr')}</option>
                <option value="ar">{td('smsClientLang', 'ar')}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-[#254222] pt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={clientForm.smsConsent}
                onChange={(e) => setClientForm({ ...clientForm, smsConsent: e.target.checked })}
                className="w-4 h-4 accent-[#254222]"
              />
              <span>{t.clients.smsConsentLabel}</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-[#CAE4C5] text-[#4A6644] rounded-xl text-[13px] hover:bg-[#F7FAF4] cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={submittingClient}
              className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] cursor-pointer disabled:opacity-50"
            >
              {submittingClient ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
