-- ============================================================================
-- MYVET — IN-APP ALGERIAN SIM GATEWAY CONFIGURATION
-- Migration: 003_sms_sim_gateway_config.sql
-- ============================================================================

ALTER TABLE sms_config
  ADD COLUMN IF NOT EXISTS sms_api_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sms_api_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sms_sender_id VARCHAR(64) NOT NULL DEFAULT 'MyVet',
  ADD COLUMN IF NOT EXISTS sim_plan_label VARCHAR(255) NOT NULL DEFAULT 'Ooredoo 2500 (SMS Illimité Tous Réseaux)';
