-- ============================================================================
-- MYVET CABINET VÉTÉRINAIRE — SUPABASE POSTGRESQL PRODUCTION SCHEMA
-- Migration: 001_initial_schema.sql
-- Multi-clinic tenant isolation, DZD integer-centime precision, safe archival,
-- atomic pharmacy inventory ledger, medical history, & idempotent SMS queue.
-- ============================================================================

-- 1. MULTI-TENANT FOUNDATION
CREATE TABLE IF NOT EXISTS clinics (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(128) UNIQUE NOT NULL,
    slogan VARCHAR(255) DEFAULT 'Le bien-être de vos compagnons, notre priorité',
    address TEXT DEFAULT '',
    phone VARCHAR(64) DEFAULT '',
    email VARCHAR(255) DEFAULT '',
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Algiers',
    currency CHAR(3) NOT NULL DEFAULT 'DZD' CHECK (currency = 'DZD'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(128) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_initials VARCHAR(8) NOT NULL DEFAULT 'MV',
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clinic_memberships (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL CHECK (role IN ('super_admin', 'clinic_admin', 'veterinarian', 'receptionist', 'assistant')),
    title VARCHAR(128) DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON clinic_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_clinic ON clinic_memberships(clinic_id);

CREATE TABLE IF NOT EXISTS login_attempts (
    key VARCHAR(255) PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    locked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. CLINICAL CORE
CREATE TABLE IF NOT EXISTS owners (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(64) NOT NULL,
    phone_normalized VARCHAR(32) NOT NULL,
    email VARCHAR(255) DEFAULT '',
    address TEXT DEFAULT '',
    preferred_language VARCHAR(8) NOT NULL DEFAULT 'fr' CHECK (preferred_language IN ('fr', 'ar')),
    sms_consent BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owners_clinic ON owners(clinic_id);
CREATE INDEX IF NOT EXISTS idx_owners_clinic_phone ON owners(clinic_id, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_owners_clinic_name ON owners(clinic_id, name);

CREATE TABLE IF NOT EXISTS animals (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    owner_id VARCHAR(64) NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    species VARCHAR(64) NOT NULL CHECK (species IN ('Chat', 'Chien', 'Autre')),
    breed VARCHAR(128) DEFAULT 'Croisé',
    color VARCHAR(128) DEFAULT '—',
    gender VARCHAR(32) NOT NULL DEFAULT 'Femelle' CHECK (gender IN ('Femelle', 'Mâle')),
    birth_date VARCHAR(64) DEFAULT '—',
    age VARCHAR(64) DEFAULT '—',
    weight VARCHAR(64) DEFAULT '—',
    microchip VARCHAR(128) DEFAULT '—',
    veterinarian VARCHAR(128) DEFAULT 'Dr. Martin',
    next_visit VARCHAR(255) DEFAULT 'Aucune visite planifiée',
    status VARCHAR(32) NOT NULL DEFAULT 'Actif' CHECK (status IN ('Actif', 'Inactif')),
    avatar_emoji VARCHAR(16) DEFAULT '🐱',
    medical_alerts JSONB NOT NULL DEFAULT '[]'::jsonb,
    medical_notes TEXT DEFAULT '',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_animals_clinic ON animals(clinic_id);
CREATE INDEX IF NOT EXISTS idx_animals_owner ON animals(owner_id);

CREATE TABLE IF NOT EXISTS vaccinations (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    animal_id VARCHAR(64) NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
    owner_id VARCHAR(64) NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    vaccine_name VARCHAR(255) NOT NULL,
    administered_date DATE NOT NULL,
    next_due_date DATE NOT NULL,
    lot_number VARCHAR(128) DEFAULT '',
    veterinarian VARCHAR(128) NOT NULL,
    notes TEXT DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'Effectué' CHECK (status IN ('Effectué', 'À planifier', 'En retard')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vaccinations_clinic ON vaccinations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_animal ON vaccinations(animal_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_next_due ON vaccinations(next_due_date);

CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    animal_id VARCHAR(64) NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
    animal_name VARCHAR(255) NOT NULL,
    owner_id VARCHAR(64) NOT NULL REFERENCES owners(id) ON DELETE RESTRICT,
    owner_name VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    start_time VARCHAR(16) NOT NULL,
    end_time VARCHAR(16) NOT NULL,
    type VARCHAR(64) NOT NULL CHECK (type IN ('Urgence', 'Consultation', 'Vaccin', 'Contrôle')),
    reason TEXT NOT NULL,
    veterinarian VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Confirmé' CHECK (status IN ('Confirmé', 'En attente', 'Terminé', 'Annulé', 'Manqué')),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON appointments(clinic_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_animal ON appointments(animal_id);

CREATE TABLE IF NOT EXISTS medical_records (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    animal_id VARCHAR(64) NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
    record_type VARCHAR(32) NOT NULL CHECK (record_type IN ('consultation', 'vital', 'note', 'document', 'treatment', 'reminder', 'communication')),
    recorded_at VARCHAR(64) NOT NULL,
    author VARCHAR(128) DEFAULT '',
    title VARCHAR(255) DEFAULT '',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_medical_records_clinic_animal ON medical_records(clinic_id, animal_id, record_type);

-- 3. OPERATIONS & PHARMACY
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    priority VARCHAR(32) NOT NULL DEFAULT 'Normale' CHECK (priority IN ('Normale', 'Haute', 'Urgente')),
    category VARCHAR(64) NOT NULL DEFAULT 'Médicale' CHECK (category IN ('Médicale', 'Administrative')),
    assigned_to VARCHAR(128) NOT NULL,
    created_by VARCHAR(128) NOT NULL,
    due_date DATE NOT NULL,
    due_date_formatted VARCHAR(64) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    related_patient_id VARCHAR(64),
    box_number VARCHAR(32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_clinic_due ON tasks(clinic_id, due_date);

CREATE TABLE IF NOT EXISTS task_comments (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    task_id VARCHAR(64) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author VARCHAR(128) NOT NULL,
    avatar VARCHAR(16) NOT NULL,
    text TEXT NOT NULL,
    comment_date VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

CREATE TABLE IF NOT EXISTS inventory_items (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL CHECK (category IN ('Vaccin', 'Antibiotique', 'Anti-inflammatoire', 'Matériel', 'Alimentation')),
    supplier VARCHAR(255) DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_threshold INTEGER NOT NULL DEFAULT 5 CHECK (min_threshold >= 0),
    unit VARCHAR(32) NOT NULL DEFAULT 'unités',
    unit_price_centimes BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_centimes >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'Normal' CHECK (status IN ('Normal', 'Critique', 'Commande en cours')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_clinic ON inventory_items(clinic_id);

CREATE TABLE IF NOT EXISTS inventory_movements (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    item_id VARCHAR(64) NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    delta INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
    reason VARCHAR(255) NOT NULL DEFAULT 'Ajustement manuel',
    performed_by VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(clinic_id, item_id, created_at DESC);

-- 4. FINANCE (DZD INTEGER CENTIMES — ZERO FLOATS)
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    invoice_number VARCHAR(64) NOT NULL,
    owner_id VARCHAR(64) REFERENCES owners(id) ON DELETE RESTRICT,
    owner_name VARCHAR(255) NOT NULL,
    animal_id VARCHAR(64) REFERENCES animals(id) ON DELETE RESTRICT,
    animal_name VARCHAR(255) NOT NULL,
    issue_date DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'DZD' CHECK (currency = 'DZD'),
    subtotal_centimes BIGINT NOT NULL CHECK (subtotal_centimes >= 0),
    tax_centimes BIGINT NOT NULL DEFAULT 0 CHECK (tax_centimes >= 0),
    total_centimes BIGINT NOT NULL CHECK (total_centimes >= 0),
    paid_centimes BIGINT NOT NULL DEFAULT 0 CHECK (paid_centimes >= 0),
    status VARCHAR(32) NOT NULL DEFAULT 'En attente' CHECK (status IN ('Payée', 'Partielle', 'En attente', 'Devis', 'Annulée')),
    notes TEXT DEFAULT '',
    created_by VARCHAR(128) NOT NULL DEFAULT 'Dr. Vétérinaire',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_clinic_date ON invoices(clinic_id, issue_date DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    invoice_id VARCHAR(64) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(255) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit_price_centimes BIGINT NOT NULL CHECK (unit_price_centimes >= 0),
    line_total_centimes BIGINT NOT NULL CHECK (line_total_centimes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    invoice_id VARCHAR(64) REFERENCES invoices(id) ON DELETE RESTRICT,
    owner_id VARCHAR(64) REFERENCES owners(id) ON DELETE RESTRICT,
    client_name VARCHAR(255) NOT NULL,
    patient_name VARCHAR(255) NOT NULL DEFAULT '—',
    amount_centimes BIGINT NOT NULL CHECK (amount_centimes > 0),
    currency CHAR(3) NOT NULL DEFAULT 'DZD' CHECK (currency = 'DZD'),
    payment_method VARCHAR(32) NOT NULL CHECK (payment_method IN ('Espèces', 'Carte Bancaire', 'Chèque / Virement')),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT DEFAULT '',
    recorded_by VARCHAR(128) NOT NULL DEFAULT 'Dr. Vétérinaire',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_clinic_paid_at ON payments(clinic_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS cash_closings (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    closing_date DATE NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'DZD' CHECK (currency = 'DZD'),
    cb_centimes BIGINT NOT NULL DEFAULT 0,
    cash_centimes BIGINT NOT NULL DEFAULT 0,
    check_transfer_centimes BIGINT NOT NULL DEFAULT 0,
    total_centimes BIGINT NOT NULL DEFAULT 0,
    expected_centimes BIGINT NOT NULL DEFAULT 0,
    variance_centimes BIGINT NOT NULL DEFAULT 0,
    operator_name VARCHAR(128) NOT NULL,
    notes TEXT DEFAULT '',
    closed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, closing_date)
);

CREATE INDEX IF NOT EXISTS idx_cash_closings_clinic_date ON cash_closings(clinic_id, closing_date DESC);

-- 5. HOSPITALIZATION
CREATE TABLE IF NOT EXISTS hospitalizations (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    box_code VARCHAR(32) NOT NULL,
    animal_id VARCHAR(64) REFERENCES animals(id) ON DELETE SET NULL,
    animal_name VARCHAR(255) NOT NULL,
    species VARCHAR(64) DEFAULT '—',
    breed VARCHAR(128) DEFAULT '—',
    owner_id VARCHAR(64) REFERENCES owners(id) ON DELETE SET NULL,
    owner_name VARCHAR(255) DEFAULT '—',
    admission_date VARCHAR(64) DEFAULT '—',
    reason TEXT NOT NULL,
    veterinarian VARCHAR(128) DEFAULT '—',
    status VARCHAR(32) NOT NULL DEFAULT 'Stable' CHECK (status IN ('Critique', 'Stable', 'En convalescence', 'Sorti', 'Disponible')),
    diet TEXT DEFAULT '—',
    last_care TEXT DEFAULT '—',
    care_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, box_code)
);

CREATE INDEX IF NOT EXISTS idx_hospitalizations_clinic ON hospitalizations(clinic_id);

-- 6. SMS COMMUNICATIONS & AUTOMATED REMINDER ENGINE
CREATE TABLE IF NOT EXISTS sms_templates (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    category VARCHAR(64) NOT NULL CHECK (category IN ('VACCINATION', 'APPOINTMENT', 'POST_OP', 'URGENCE')),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    language VARCHAR(8) NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'ar')),
    is_default BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_clinic ON sms_templates(clinic_id, category);

CREATE TABLE IF NOT EXISTS sms_reminders (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    owner_id VARCHAR(64) REFERENCES owners(id) ON DELETE CASCADE,
    animal_id VARCHAR(64) REFERENCES animals(id) ON DELETE CASCADE,
    vaccination_id VARCHAR(64) REFERENCES vaccinations(id) ON DELETE CASCADE,
    appointment_id VARCHAR(64) REFERENCES appointments(id) ON DELETE CASCADE,
    reminder_type VARCHAR(64) NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled', 'Processing', 'Accepted', 'Sent', 'Delivered', 'Failed', 'Cancelled', 'Unknown')),
    idempotency_key VARCHAR(128) NOT NULL,
    provider_id VARCHAR(64),
    provider_message_id VARCHAR(128),
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    worker_id VARCHAR(128),
    failure_type VARCHAR(32),
    is_ambiguous BOOLEAN NOT NULL DEFAULT FALSE,
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clinic_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sms_reminders_claim ON sms_reminders(status, scheduled_at, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_clinic ON sms_reminders(clinic_id, scheduled_at);

CREATE TABLE IF NOT EXISTS sms_logs (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    reminder_id VARCHAR(64),
    owner_id VARCHAR(64),
    animal_id VARCHAR(64),
    recipient_name VARCHAR(255) NOT NULL,
    recipient_phone VARCHAR(64) NOT NULL,
    animal_name VARCHAR(255),
    category VARCHAR(64) NOT NULL,
    message_content TEXT NOT NULL,
    encoding VARCHAR(32) NOT NULL DEFAULT 'GSM-7',
    segment_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL,
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE,
    provider_name VARCHAR(128) DEFAULT 'TestSMSProvider',
    provider_message_id VARCHAR(128),
    provider_response TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_clinic_created ON sms_logs(clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_provider_msg ON sms_logs(provider_message_id);

CREATE TABLE IF NOT EXISTS sms_config (
    clinic_id VARCHAR(64) PRIMARY KEY REFERENCES clinics(id) ON DELETE CASCADE,
    provider_mode VARCHAR(32) NOT NULL DEFAULT 'TEST' CHECK (provider_mode IN ('TEST', 'PRODUCTION')),
    active_provider VARCHAR(128) NOT NULL DEFAULT 'Ooredoo_Business_Algeria',
    api_key_configured BOOLEAN NOT NULL DEFAULT FALSE,
    enable_vaccination_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    vaccination_intervals VARCHAR(64) NOT NULL DEFAULT '7,3,1',
    enable_appointment_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    appointment_interval_hours INTEGER NOT NULL DEFAULT 24,
    sending_start_hour INTEGER NOT NULL DEFAULT 8 CHECK (sending_start_hour >= 0 AND sending_start_hour <= 23),
    sending_end_hour INTEGER NOT NULL DEFAULT 20 CHECK (sending_end_hour >= 0 AND sending_end_hour <= 23),
    timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Algiers',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. AUDIT LOGS & IDEMPOTENT MIGRATION TRACKING
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    user_id VARCHAR(64),
    user_name VARCHAR(255) NOT NULL DEFAULT 'Système',
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_created ON audit_logs(clinic_id, created_at DESC);

CREATE TABLE IF NOT EXISTS migration_imports (
    id VARCHAR(64) PRIMARY KEY,
    clinic_id VARCHAR(64) NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    batch_hash VARCHAR(128) NOT NULL,
    source_format VARCHAR(64) NOT NULL DEFAULT 'vetosuite-localstorage',
    dry_run BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    imported_by VARCHAR(128) NOT NULL DEFAULT 'Système',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_imports_applied
    ON migration_imports(clinic_id, batch_hash)
    WHERE dry_run = FALSE;

-- 8. SUPABASE ROW-LEVEL SECURITY HELPERS & POLICIES
-- Enables defense-in-depth when PostgreSQL roles honor RLS alongside server clinic filtering.
CREATE OR REPLACE FUNCTION app_current_clinic_id() RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.clinic_id', true), '');
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_imports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'owners', 'animals', 'vaccinations', 'appointments', 'medical_records',
        'tasks', 'task_comments', 'inventory_items', 'inventory_movements',
        'invoices', 'invoice_items', 'payments', 'cash_closings',
        'hospitalizations', 'sms_templates', 'sms_reminders', 'sms_logs',
        'sms_config', 'audit_logs', 'migration_imports'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY tenant_isolation_%I ON %I USING (app_current_clinic_id() IS NULL OR clinic_id = app_current_clinic_id()) WITH CHECK (app_current_clinic_id() IS NULL OR clinic_id = app_current_clinic_id())',
            tbl, tbl
        );
    END LOOP;
END $$;
