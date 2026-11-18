import crypto from 'node:crypto';
import { normalizeAlgerianPhone } from '../../../shared/utils/phone.ts';
import { analyzeSMSContent } from '../../../shared/utils/smsSegmentation.ts';
import type { SMSProvider, SmsSendRequest, SmsSendResult, SmsWebhookEvent } from './types.ts';

/**
 * Safe Simulation Provider (Active when SMS_PROVIDER_MODE=TEST).
 * Validates Algerian E.164 formatting & GSM-7/UCS-2 segmentation without billing or external network calls.
 * Always marks messages as simulated (`isSimulated: true`) and never fakes real carrier delivery.
 */
export class TestSMSProvider implements SMSProvider {
  readonly providerName = 'TestSMSProvider (Mode Simulation)';
  readonly isSimulated = true;

  async sendSms(request: SmsSendRequest): Promise<SmsSendResult> {
    const phoneInfo = normalizeAlgerianPhone(request.toE164);
    const seg = analyzeSMSContent(request.message);

    if (!phoneInfo.isValid) {
      return {
        success: false,
        isSimulated: true,
        providerName: this.providerName,
        providerMessageId: null,
        status: 'Failed',
        failureType: 'PERMANENT',
        errorMessage: phoneInfo.error || 'Numéro algérien invalide',
        rawResponse: {
          mode: 'TEST_SIMULATION',
          simulated: true,
          valid: false,
          error: phoneInfo.error,
        },
      };
    }

    const messageId = `SIM-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;

    return {
      success: true,
      isSimulated: true,
      providerName: this.providerName,
      providerMessageId: messageId,
      // Honest simulated dispatch status: 'Sent' with simulated flag, never fake 'Delivered' without webhook
      status: 'Sent',
      rawResponse: {
        mode: 'TEST_SIMULATION',
        simulated: true,
        notice: 'Simulation locale uniquement — aucun SMS payant transmis sur le réseau télécom.',
        to: phoneInfo.e164,
        carrierPrefix: phoneInfo.operator,
        senderId: request.senderId,
        encoding: seg.encoding,
        segments: seg.segmentCount,
        characters: seg.characterCount,
        messageId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  verifyWebhookSignature(_rawBody: string, _signatureHeader: string | undefined): boolean {
    return true;
  }

  parseDeliveryWebhook(payload: Record<string, unknown>): SmsWebhookEvent | null {
    const providerMessageId = String(payload.providerMessageId || payload.messageId || '').trim();
    if (!providerMessageId) return null;
    const rawStatus = String(payload.status || 'Unknown');
    const allowed = ['Accepted', 'Sent', 'Delivered', 'Failed', 'Unknown'] as const;
    const status = (allowed.includes(rawStatus as any) ? rawStatus : 'Unknown') as SmsWebhookEvent['status'];
    return {
      providerMessageId,
      status,
      errorDetail: payload.errorDetail ? String(payload.errorDetail) : undefined,
      rawPayload: payload,
    };
  }
}
