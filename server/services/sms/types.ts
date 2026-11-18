import type { SmsDeliveryStatus } from '../../../shared/types/domain.ts';

export interface SmsSendRequest {
  toE164: string;
  senderId: string;
  message: string;
  recipientName: string;
  category: string;
  metadata?: Record<string, string>;
}

export interface SmsSendResult {
  success: boolean;
  isSimulated: boolean;
  providerName: string;
  providerMessageId: string | null;
  status: SmsDeliveryStatus;
  failureType?: 'PERMANENT' | 'RETRYABLE_TEMPORARY';
  isAmbiguous?: boolean;
  errorMessage?: string;
  rawResponse: Record<string, unknown>;
}

export interface SmsWebhookEvent {
  providerMessageId: string;
  status: SmsDeliveryStatus;
  errorDetail?: string;
  rawPayload?: Record<string, unknown>;
}

export interface SMSProvider {
  readonly providerName: string;
  readonly isSimulated: boolean;
  sendSms(request: SmsSendRequest): Promise<SmsSendResult>;
  verifyWebhookSignature?(rawBody: string, signatureHeader: string | undefined): boolean;
  parseDeliveryWebhook(payload: Record<string, unknown>): SmsWebhookEvent | null;
}
