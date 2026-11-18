-- ============================================================================
-- MYVET CABINET VÉTÉRINAIRE — REMOVE SECONDARY HYDRA CLINIC (IDEMPOTENT)
-- Migration: 002_remove_hydra_clinic.sql
-- Keeps only the primary Ouled Fayet clinic ('clinic-myvet-ouled-fayet').
-- Deletes dependent rows in strict FK order to satisfy ON DELETE RESTRICT.
-- ============================================================================

DELETE FROM sms_logs WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM sms_reminders WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM sms_templates WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM sms_config WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM audit_logs WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM migration_imports WHERE clinic_id = 'clinic-myvet-hydra';

DELETE FROM payments WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM invoice_items WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM invoices WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM cash_closings WHERE clinic_id = 'clinic-myvet-hydra';

DELETE FROM inventory_movements WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM inventory_items WHERE clinic_id = 'clinic-myvet-hydra';

DELETE FROM task_comments WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM tasks WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM hospitalizations WHERE clinic_id = 'clinic-myvet-hydra';

DELETE FROM medical_records WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM appointments WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM vaccinations WHERE clinic_id = 'clinic-myvet-hydra';

DELETE FROM animals WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM owners WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM clinic_memberships WHERE clinic_id = 'clinic-myvet-hydra';
DELETE FROM clinics WHERE id = 'clinic-myvet-hydra';
