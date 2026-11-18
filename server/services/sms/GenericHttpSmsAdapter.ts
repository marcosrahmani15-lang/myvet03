import crypto from 'node:crypto';
import type { SMSProvider, SmsSendRequest, SmsSendResult, SmsWebhookEvent } from './types.ts';

export type GatewayPayloadFormat = 'pushcut' | 'textbee' | 'android_sms_gate' | 'generic';

export function maskApiKey(apiKey?: string | null): string {
  const clean = (apiKey || '').trim();
  if (!clean) return '';
  if (clean.length <= 4) return '••••';
  return `••••${clean.slice(-4)}`;
}

export interface GenericHttpSmsConfig {
  apiUrl: string;
  apiKey: string;
  senderId: string;
  webhookSecret?: string;
  providerLabel?: string;
  timeoutMs?: number;
  payloadFormat?: GatewayPayloadFormat;
}

export function detectGatewayFormat(apiUrl: string, explicitFormat?: GatewayPayloadFormat): GatewayPayloadFormat {
  if (explicitFormat) return explicitFormat;
  const lower = (apiUrl || '').toLowerCase();
  if (lower.includes('pushcut.io')) return 'pushcut';
  if (lower.includes('textbee.dev')) return 'textbee';
  if (lower.includes('sms-gate.app') || lower.includes('/3rdparty/v1/message')) return 'android_sms_gate';
  return 'generic';
}

export function buildGatewayPayload(
  apiUrl: string,
  senderId: string,
  request: SmsSendRequest,
  explicitFormat?: GatewayPayloadFormat
): Record<string, unknown> {
  const format = detectGatewayFormat(apiUrl, explicitFormat);

  if (format === 'pushcut') {
    // iOS Pushcut Webhook payload format for Apple Shortcuts SMS automation
    return {
      input: {
        phone: request.toE164,
        message: request.message,
      },
      title: `MyVet SMS → ${request.recipientName || request.toE164}`,
      text: request.message,
    };
  }

  if (format === 'textbee') {
    // TextBee Android/SIM Gateway payload format
    return {
      recipients: [request.toE164],
      message: request.message,
    };
  }

  if (format === 'android_sms_gate') {
    // Android SMS Gateway (sms-gate.app) payload format
    return {
      textMessage: {
        text: request.message,
      },
      phoneNumbers: [request.toE164],
    };
  }

  // Generic HTTP SMS REST API payload format
  return {
    to: request.toE164,
    from: request.senderId || senderId,
    message: request.message,
    category: request.category,
    metadata: request.metadata || {},
  };
}

/**
 * Provider-Independent HTTP SMS Gateway Adapter for Production & Direct Gateway Dispatch.
 * Supports TextBee SIM Gateways, Android SMS Gate, iOS Pushcut Webhooks, and standard HTTP REST SMS APIs.
 */
export class GenericHttpSmsAdapter implements SMSProvider {
  readonly providerName: string;
  readonly isSimulated = false;
  private readonly config: GenericHttpSmsConfig;

  constructor(config: GenericHttpSmsConfig) {
    this.config = config;
    this.providerName = config.providerLabel || 'GenericHttpSmsAdapter';
  }

  async sendSms(request: SmsSendRequest): Promise<SmsSendResult> {
    const format = detectGatewayFormat(this.config.apiUrl, this.config.payloadFormat);
    const requiresApiKey = format !== 'pushcut';

    if (!this.config.apiUrl || (requiresApiKey && !this.config.apiKey)) {
      return {
        success: false,
        isSimulated: false,
        providerName: this.providerName,
        providerMessageId: null,
        status: 'Failed',
        failureType: 'PERMANENT',
        errorMessage:
          'Passerelle SIM non configurée : veuillez renseigner l’URL et la clé API dans « Configurer SIM / Passerelle SMS ».',
        rawResponse: { error: 'MISSING_PRODUCTION_CREDENTIALS', format },
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);
    const payload = buildGatewayPayload(
      this.config.apiUrl,
      this.config.senderId,
      request,
      this.config.payloadFormat
    );

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
      headers['X-API-Key'] = this.config.apiKey;
      headers['x-api-key'] = this.config.apiKey;
    }

    try {
      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const bodyText = await response.text();
      let parsed: Record<string, unknown> = { raw: bodyText };
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // non-json response kept as raw
      }

      if (!response.ok) {
        const isRetryable = response.status >= 500 || response.status === 429 || response.status === 408;
        const detail =
          typeof parsed.error === 'string'
            ? parsed.error
            : typeof parsed.message === 'string'
            ? parsed.message
            : '';
        return {
          success: false,
          isSimulated: false,
          providerName: this.providerName,
          providerMessageId: null,
          status: 'Failed',
          failureType: isRetryable ? 'RETRYABLE_TEMPORARY' : 'PERMANENT',
          isAmbiguous: response.status >= 500,
          errorMessage: detail
            ? `Passerelle SIM HTTP ${response.status} : ${detail}`
            : `Passerelle SIM inaccessible ou erreur HTTP ${response.status}`,
          rawResponse: { format, ...parsed },
        };
      }

      const providerMessageId =
        String(parsed.messageId || parsed.id || parsed.providerMessageId || '') ||
        `SIM-${Date.now()}`;

      return {
        success: true,
        isSimulated: false,
        providerName: this.providerName,
        providerMessageId,
        status: 'Accepted',
        rawResponse: { format, ...parsed },
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      return {
        success: false,
        isSimulated: false,
        providerName: this.providerName,
        providerMessageId: null,
        status: 'Failed',
        failureType: 'RETRYABLE_TEMPORARY',
        isAmbiguous: isAbort,
        errorMessage: isAbort
          ? 'Délai dépassé : la passerelle SIM n’a pas répondu à temps.'
          : `Passerelle SIM injoignable : ${err?.message || 'Erreur réseau'}`,
        rawResponse: { format, error: err?.message || 'Network failure', ambiguous: isAbort },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.config.webhookSecret) return false;
    if (!signatureHeader) return false;
    const expected = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(rawBody)
      .digest('hex');
    const a = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  parseDeliveryWebhook(payload: Record<string, unknown>): SmsWebhookEvent | null {
    const providerMessageId = String(payload.providerMessageId || payload.messageId || payload.id || '').trim();
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
