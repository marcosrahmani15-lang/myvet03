import crypto from 'node:crypto';

export interface ServerEnv {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  isVercel: boolean;
  port: number;
  databaseUrl: string | undefined;
  sessionSecret: string;
  cronSecret: string | undefined;
  appUrl: string;
  autoDevLogin: boolean;
  enableDevScheduler: boolean;
  smsProviderMode: 'TEST' | 'PRODUCTION';
  smsApiUrl: string | undefined;
  smsApiKey: string | undefined;
  smsSenderId: string;
  smsWebhookSecret: string | undefined;
}

// Ephemeral fallback ONLY for local non-production dev when SESSION_SECRET is unset
const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

export function getServerEnv(): ServerEnv {
  const nodeEnvRaw = process.env.NODE_ENV || 'development';
  const nodeEnv =
    nodeEnvRaw === 'production'
      ? 'production'
      : nodeEnvRaw === 'test'
      ? 'test'
      : 'development';
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const isProduction = nodeEnv === 'production' || process.env.VERCEL_ENV === 'production';

  const requireLogin = process.env.REQUIRE_LOGIN === 'true';
  const sessionSecret = process.env.SESSION_SECRET || EPHEMERAL_DEV_SECRET;
  if (isProduction && requireLogin && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16)) {
    throw new Error(
      'CRITICAL SECURITY ERROR: SESSION_SECRET must be set (>= 16 characters) when REQUIRE_LOGIN=true in production.'
    );
  }

  const autoDevLogin =
    !requireLogin && process.env.AUTO_DEV_LOGIN !== 'false';

  const smsModeRaw = (process.env.SMS_PROVIDER_MODE || 'TEST').toUpperCase();
  const smsProviderMode: 'TEST' | 'PRODUCTION' =
    smsModeRaw === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';

  return {
    nodeEnv,
    isProduction,
    isVercel,
    port: parseInt(process.env.PORT || '3000', 10),
    databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
    sessionSecret,
    cronSecret: process.env.CRON_SECRET?.trim() || undefined,
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    autoDevLogin,
    enableDevScheduler: !isVercel && process.env.ENABLE_DEV_SCHEDULER === 'true',
    smsProviderMode,
    smsApiUrl: process.env.SMS_API_URL?.trim() || undefined,
    smsApiKey: process.env.SMS_API_KEY?.trim() || undefined,
    smsSenderId: process.env.SMS_SENDER_ID?.trim() || 'MyVet',
    smsWebhookSecret: process.env.SMS_WEBHOOK_SECRET?.trim() || undefined,
  };
}
