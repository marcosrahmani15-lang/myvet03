-- ============================================================================
-- MYVET CABINET VÉTÉRINAIRE — DEFAULT CLINIC & DEMO SEED (IDEMPOTENT)
-- Seed Password for demo staff accounts: MyVet2026!
-- Primary Clinic: My Vet — Cabinet Vétérinaire (Ouled Fayet, Algeria)
-- Currency: DZD | Timezone: Africa/Algiers
-- ============================================================================

INSERT INTO clinics (id, name, slug, slogan, address, phone, email, timezone, currency)
VALUES
  (
    'clinic-myvet-ouled-fayet',
    'My Vet — Cabinet Vétérinaire',
    'myvet-ouled-fayet',
    'Le bien-être de vos compagnons, notre priorité',
    'Coopérative el moustakbel n° CC3, Ouled Fayet, Alger',
    '0797 63 87 04',
    'contact@myvet-alger.dz',
    'Africa/Algiers',
    'DZD'
  )
ON CONFLICT (id) DO NOTHING;

-- Password for all seeded accounts: MyVet2026!
INSERT INTO users (id, email, username, full_name, avatar_initials, password_hash, is_active)
VALUES
  (
    'user-dr-vet',
    'dr.vet@myvet.dz',
    'dr.vet',
    'Dr. Vétérinaire',
    'DV',
    'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:68a611b5099bedd23ccd81d0d379a8d39d241b46b99ce50bdafa45b27083112078c01eb05d622847415b5ac9392ba9edfdb22d692af6e1a30bed25e6880addeb',
    TRUE
  ),
  (
    'user-dr-martin',
    'dr.martin@myvet.dz',
    'dr.martin',
    'Dr. Martin',
    'DM',
    'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:68a611b5099bedd23ccd81d0d379a8d39d241b46b99ce50bdafa45b27083112078c01eb05d622847415b5ac9392ba9edfdb22d692af6e1a30bed25e6880addeb',
    TRUE
  ),
  (
    'user-receptionist',
    'accueil@myvet.dz',
    'accueil',
    'Amina Benali',
    'AB',
    'scrypt:a1b2c3d4e5f60718293a4b5c6d7e8f90:68a611b5099bedd23ccd81d0d379a8d39d241b46b99ce50bdafa45b27083112078c01eb05d622847415b5ac9392ba9edfdb22d692af6e1a30bed25e6880addeb',
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO clinic_memberships (id, clinic_id, user_id, role, title, is_default)
VALUES
  ('mem-1', 'clinic-myvet-ouled-fayet', 'user-dr-vet', 'clinic_admin', 'Praticien titulaire & Directeur', TRUE),
  ('mem-3', 'clinic-myvet-ouled-fayet', 'user-dr-martin', 'veterinarian', 'Vétérinaire associé', TRUE),
  ('mem-4', 'clinic-myvet-ouled-fayet', 'user-receptionist', 'receptionist', 'Assistante accueil & facturation', TRUE)
ON CONFLICT (clinic_id, user_id) DO NOTHING;

INSERT INTO owners (id, clinic_id, name, phone, phone_normalized, email, address, preferred_language, sms_consent, notes)
VALUES
  ('c1', 'clinic-myvet-ouled-fayet', 'Fatima Mansouri', '0555 55 55 55', '+213555555555', 'fatima.mansouri@email.dz', '12 Rue des Jardins, Ouled Fayet, Alger', 'fr', TRUE, 'Cliente fidèle'),
  ('c2', 'clinic-myvet-ouled-fayet', 'Karim Dubois', '0612 34 56 78', '+213612345678', 'k.dubois@email.dz', '45 Avenue de la Liberté, Chéraga', 'fr', TRUE, ''),
  ('c3', 'clinic-myvet-ouled-fayet', 'Samira Lambert', '0678 90 12 34', '+213678901234', 's.lambert@email.dz', '8 Résidence El Moustakbel, Ouled Fayet', 'fr', TRUE, ''),
  ('c4', 'clinic-myvet-ouled-fayet', 'Yacine Laurent', '0770 45 67 89', '+213770456789', 'y.laurent@email.dz', '23 Chemin des Crêtes, Dely Ibrahim', 'fr', TRUE, '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO animals (id, clinic_id, owner_id, name, species, breed, color, gender, birth_date, age, weight, microchip, veterinarian, next_visit, status, avatar_emoji, medical_alerts, medical_notes)
VALUES
  ('nina', 'clinic-myvet-ouled-fayet', 'c1', 'Nina', 'Chat', 'Européen', 'Roux et blanc', 'Femelle', '02/02/2025', '1 an 6 mois', '5 kg', '250269802345671', 'Dr. Martin', '2026-08-20 (Vaccin annuel)', 'Actif', '🐱', '[{"id":"al1","type":"Antécédents","badge":"INFO","description":"Vaccin annuel à surveiller"}]'::jsonb, ''),
  ('rocky', 'clinic-myvet-ouled-fayet', 'c2', 'Rocky', 'Chien', 'Berger Allemand', 'Noir et feu', 'Mâle', '15/04/2021', '5 ans 4 mois', '32 kg', '250269802112233', 'Dr. Martin', '18/08/2026 (Contrôle post-op)', 'Actif', '🐶', '[{"id":"al2","type":"Chirurgie","badge":"INFO","description":"Retrait points suture prévu"}]'::jsonb, ''),
  ('felix', 'clinic-myvet-ouled-fayet', 'c3', 'Félix', 'Chat', 'Siamois', 'Seal Point', 'Mâle', '10/09/2023', '2 ans 11 mois', '4.2 kg', '250269802445566', 'Dr. Leroy', 'Aucune visite planifiée', 'Actif', '🐈', '[]'::jsonb, ''),
  ('maya', 'clinic-myvet-ouled-fayet', 'c4', 'Maya', 'Chien', 'Golden Retriever', 'Sable doré', 'Femelle', '22/11/2019', '6 ans 9 mois', '28.5 kg', '250269802778899', 'Dr. Bernard', '05/09/2026 (Bilan senior)', 'Actif', '🐕', '[{"id":"al3","type":"Allergie","badge":"URGENT","description":"Sensibilité pénicilline"}]'::jsonb, '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO vaccinations (id, clinic_id, animal_id, owner_id, vaccine_name, administered_date, next_due_date, lot_number, veterinarian, status)
VALUES
  ('vac-1', 'clinic-myvet-ouled-fayet', 'nina', 'c1', 'Vaccin annuel (Typhus-Coryza-Leucose)', '2025-08-20', '2026-08-20', 'BIO-2025-X8', 'Dr. Martin', 'Effectué')
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, clinic_id, animal_id, animal_name, owner_id, owner_name, date, start_time, end_time, type, reason, veterinarian, status, notes)
VALUES
  ('apt-1', 'clinic-myvet-ouled-fayet', 'nina', 'Nina', 'c1', 'Fatima Mansouri', '2026-08-14', '09:00', '09:30', 'Vaccin', 'Vaccination annuelle', 'Dr. Martin', 'Confirmé', 'Prévoir rappel rage'),
  ('apt-2', 'clinic-myvet-ouled-fayet', 'rocky', 'Rocky', 'c2', 'Karim Dubois', '2026-08-14', '11:30', '12:00', 'Urgence', 'Boiterie patte arrière droite', 'Dr. Martin', 'Confirmé', 'Radio possible'),
  ('apt-3', 'clinic-myvet-ouled-fayet', 'felix', 'Félix', 'c3', 'Samira Lambert', '2026-08-14', '14:00', '14:30', 'Contrôle', 'Contrôle dermatologique', 'Dr. Leroy', 'En attente', ''),
  ('apt-4', 'clinic-myvet-ouled-fayet', 'maya', 'Maya', 'c4', 'Yacine Laurent', '2026-08-13', '10:00', '10:30', 'Consultation', 'Bilan senior annuel', 'Dr. Bernard', 'Confirmé', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO tasks (id, clinic_id, title, description, priority, category, assigned_to, created_by, due_date, due_date_formatted, completed, box_number)
VALUES
  ('t1', 'clinic-myvet-ouled-fayet', 'Commander des vaccins chlamydiose féline', 'Vérifier les stocks avant la commande hebdomadaire chez notre fournisseur.', 'Normale', 'Administrative', 'Dr. Martin', 'Dr. Vétérinaire', '2026-08-15', 'Aug 15, 2026', FALSE, NULL),
  ('t2', 'clinic-myvet-ouled-fayet', 'Surveiller la glycémie du patient en box 3', 'Prise de sang prévue à 14h00 avant le repas du soir.', 'Urgente', 'Médicale', 'Dr. Leroy', 'Dr. Vétérinaire', '2026-08-12', 'Aug 12, 2026', FALSE, '3'),
  ('t3', 'clinic-myvet-ouled-fayet', 'Rappeler Fatima Mansouri pour les résultats', 'Analyse sanguine normale, expliquer le suivi diététique.', 'Haute', 'Médicale', 'Dr. Martin', 'Dr. Martin', '2026-08-14', 'Aug 14, 2026', FALSE, NULL),
  ('t4', 'clinic-myvet-ouled-fayet', 'Stérilisation des instruments bloc A', 'Cycle autoclave complet à lancer après l’intervention du matin.', 'Normale', 'Administrative', 'Dr. Bernard', 'Dr. Vétérinaire', '2026-08-14', 'Aug 14, 2026', TRUE, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO task_comments (id, clinic_id, task_id, author, avatar, text, comment_date)
VALUES
  ('c-t1', 'clinic-myvet-ouled-fayet', 't1', 'Dr. Martin', 'DM', 'Il reste 4 doses au frigo B.', 'Aug 14, 2026'),
  ('c-t2', 'clinic-myvet-ouled-fayet', 't2', 'Dr. Vétérinaire', 'DV', 'Courbe de glycémie amorcée ce matin à 8h.', 'Aug 14, 2026')
ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory_items (id, clinic_id, name, category, supplier, quantity, min_threshold, unit, unit_price_centimes, status)
VALUES
  ('s1', 'clinic-myvet-ouled-fayet', 'Vaccin Nobivac DHPPi', 'Vaccin', 'MSD Santé Animale', 4, 10, 'doses', 220000, 'Critique'),
  ('s2', 'clinic-myvet-ouled-fayet', 'Vaccin Purevax RCPCh', 'Vaccin', 'Boehringer Ingelheim', 18, 12, 'doses', 250000, 'Normal'),
  ('s3', 'clinic-myvet-ouled-fayet', 'Amoxicilline Clavaseptin 250mg', 'Antibiotique', 'Vetoquinol', 6, 8, 'boîtes', 145000, 'Critique'),
  ('s4', 'clinic-myvet-ouled-fayet', 'Meloxicam Metacam 1.5mg/ml', 'Anti-inflammatoire', 'Boehringer Ingelheim', 12, 5, 'flacons', 320000, 'Normal'),
  ('s5', 'clinic-myvet-ouled-fayet', 'Cathéters IV 22G', 'Matériel', 'B. Braun Vet', 85, 30, 'unités', 18000, 'Normal'),
  ('s6', 'clinic-myvet-ouled-fayet', 'Croquettes Hypoallergéniques 2kg', 'Alimentation', 'Royal Canin Vet', 3, 6, 'sacs', 580000, 'Critique')
ON CONFLICT (id) DO NOTHING;

-- DZD Invoices & Payments (1 DZD = 100 centimes)
INSERT INTO invoices (id, clinic_id, invoice_number, owner_id, owner_name, animal_id, animal_name, issue_date, currency, subtotal_centimes, tax_centimes, total_centimes, paid_centimes, status, notes, created_by)
VALUES
  ('inv-1', 'clinic-myvet-ouled-fayet', 'FAC-2026-0842', 'c1', 'Fatima Mansouri', 'nina', 'Nina', '2026-08-14', 'DZD', 850000, 0, 850000, 850000, 'Payée', 'Vaccination annuelle + Consultation', 'Dr. Vétérinaire'),
  ('inv-2', 'clinic-myvet-ouled-fayet', 'FAC-2026-0841', 'c2', 'Karim Dubois', 'rocky', 'Rocky', '2026-08-14', 'DZD', 1200000, 0, 1200000, 1200000, 'Payée', 'Soins post-op + Pansements', 'Dr. Martin'),
  ('inv-3', 'clinic-myvet-ouled-fayet', 'FAC-2026-0840', 'c3', 'Samira Lambert', 'felix', 'Félix', '2026-08-14', 'DZD', 650000, 0, 650000, 650000, 'Payée', 'Traitement dermatologique', 'Dr. Leroy'),
  ('inv-4', 'clinic-myvet-ouled-fayet', 'FAC-2026-0839', 'c4', 'Yacine Laurent', 'maya', 'Maya', '2026-08-11', 'DZD', 1100000, 0, 1100000, 0, 'En attente', 'Bilan gériatrique complet', 'Dr. Bernard'),
  ('inv-5', 'clinic-myvet-ouled-fayet', 'DEV-2026-0104', 'c4', 'Yacine Laurent', 'maya', 'Maya', '2026-08-10', 'DZD', 4500000, 0, 4500000, 0, 'Devis', 'Détartrage & extractions dentaires', 'Dr. Bernard')
ON CONFLICT (id) DO NOTHING;

INSERT INTO invoice_items (id, clinic_id, invoice_id, description, quantity, unit_price_centimes, line_total_centimes)
VALUES
  ('invi-1', 'clinic-myvet-ouled-fayet', 'inv-1', 'Consultation vaccinale & injection RCPCh', 1, 850000, 850000),
  ('invi-2', 'clinic-myvet-ouled-fayet', 'inv-2', 'Soins post-opératoires & réfection pansement', 1, 1200000, 1200000),
  ('invi-3', 'clinic-myvet-ouled-fayet', 'inv-3', 'Consultation dermatologique + lotions', 1, 650000, 650000),
  ('invi-4', 'clinic-myvet-ouled-fayet', 'inv-4', 'Bilan sanguin biochimique complet', 1, 1100000, 1100000),
  ('invi-5', 'clinic-myvet-ouled-fayet', 'inv-5', 'Chirurgie dentaire & anesthésie gazeuse', 1, 4500000, 4500000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO payments (id, clinic_id, invoice_id, owner_id, client_name, patient_name, amount_centimes, currency, payment_method, paid_at, description, recorded_by)
VALUES
  ('pay-1', 'clinic-myvet-ouled-fayet', 'inv-1', 'c1', 'Fatima Mansouri', 'Nina', 850000, 'DZD', 'Espèces', '2026-08-14T09:30:00+01:00', 'Vaccination annuelle + Consultation', 'Dr. Vétérinaire'),
  ('pay-2', 'clinic-myvet-ouled-fayet', 'inv-2', 'c2', 'Karim Dubois', 'Rocky', 1200000, 'DZD', 'Carte Bancaire', '2026-08-14T11:45:00+01:00', 'Soins post-op + Pansements', 'Dr. Martin'),
  ('pay-3', 'clinic-myvet-ouled-fayet', 'inv-3', 'c3', 'Samira Lambert', 'Félix', 650000, 'DZD', 'Espèces', '2026-08-14T14:20:00+01:00', 'Traitement dermatologique', 'Dr. Leroy')
ON CONFLICT (id) DO NOTHING;

-- Hospitalizations
INSERT INTO hospitalizations (id, clinic_id, box_code, animal_id, animal_name, species, breed, owner_id, owner_name, admission_date, reason, veterinarian, status, diet, last_care)
VALUES
  ('hosp-h1', 'clinic-myvet-ouled-fayet', 'Box H1', 'felix', 'Félix', 'Chat', 'Siamois', 'c3', 'Samira Lambert', '2026-08-13', 'Perfusion réhydratation & surveillance', 'Dr. Leroy', 'Stable', 'Alimentation humide gastro-intestinale', '14/08 à 08:30 (Perfusion vérifiée)'),
  ('hosp-h2', 'clinic-myvet-ouled-fayet', 'Box H2', 'rocky', 'Rocky', 'Chien', 'Berger Allemand', 'c2', 'Karim Dubois', '2026-08-12', 'Laparotomie exploratrice J+2 — Soins pansement', 'Dr. Martin', 'En convalescence', 'Ration ménagère hyper-digestible', '14/08 à 10:00 (Pansement abdominal refait)'),
  ('hosp-h3', 'clinic-myvet-ouled-fayet', 'Box H3', NULL, 'Libre', '—', '—', NULL, '—', '—', 'Box désinfecté prêt pour admission', '—', 'Disponible', '—', 'Désinfection le 14/08 à 07:00'),
  ('hosp-c1', 'clinic-myvet-ouled-fayet', 'Box C1', 'maya', 'Maya', 'Chien', 'Golden Retriever', 'c4', 'Yacine Laurent', '2026-08-14', 'Oxygénothérapie & surveillance respiratoire', 'Dr. Bernard', 'Critique', 'À jeun sous surveillance continue', '14/08 à 11:15 (Saturation O2 mesurée 96%)')
ON CONFLICT (id) DO NOTHING;

-- SMS Config & Templates (French + Arabic)
INSERT INTO sms_config (clinic_id, provider_mode, active_provider, api_key_configured, enable_vaccination_reminders, vaccination_intervals, enable_appointment_reminders, appointment_interval_hours, sending_start_hour, sending_end_hour, timezone)
VALUES
  ('clinic-myvet-ouled-fayet', 'TEST', 'Ooredoo_Business_Algeria', FALSE, TRUE, '7,3,1', TRUE, 24, 8, 20, 'Africa/Algiers')
ON CONFLICT (clinic_id) DO NOTHING;

INSERT INTO sms_templates (id, clinic_id, category, title, content, language, is_default)
VALUES
  ('tpl-vac-fr', 'clinic-myvet-ouled-fayet', 'VACCINATION', 'Rappel Vaccin Standard (FR)', 'Cabinet My Vet: Bonjour {{ownerName}}, le rappel vaccin ({{vaccineName}}) pour {{animalName}} est prévu le {{dueDate}}. Tel: 0797 63 87 04 (Ouled Fayet).', 'fr', TRUE),
  ('tpl-apt-fr', 'clinic-myvet-ouled-fayet', 'APPOINTMENT', 'Confirmation Rendez-vous 24h (FR)', 'Cabinet My Vet: Rappel de votre RDV pour {{animalName}} demain le {{date}} à {{time}}. Coopérative El Moustakbel, Ouled Fayet. Tel: 0797 63 87 04.', 'fr', TRUE),
  ('tpl-vac-ar', 'clinic-myvet-ouled-fayet', 'VACCINATION', 'تذكير بالتلقيح (AR)', 'عيادة My Vet: مرحبا {{ownerName}}، موعد تلقيح {{animalName}} مقرر يوم {{dueDate}}. أولاد فايت. الهاتف: 0797638704', 'ar', FALSE),
  ('tpl-post-fr', 'clinic-myvet-ouled-fayet', 'POST_OP', 'Suivi Post-Opératoire (FR)', 'Cabinet My Vet: Bonjour {{ownerName}}, comment se porte {{animalName}} suite à son intervention ? En cas de besoin appelez le 0797 63 87 04.', 'fr', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sms_reminders (id, clinic_id, owner_id, animal_id, vaccination_id, reminder_type, scheduled_at, status, idempotency_key, attempts, is_simulated)
VALUES
  ('rem-vac-1-7d', 'clinic-myvet-ouled-fayet', 'c1', 'nina', 'vac-1', 'VACCINATION_7D', '2026-08-13T08:00:00+01:00', 'Sent', 'vac-vac-1-7d', 1, TRUE),
  ('rem-vac-1-3d', 'clinic-myvet-ouled-fayet', 'c1', 'nina', 'vac-1', 'VACCINATION_3D', '2026-08-17T08:00:00+01:00', 'Scheduled', 'vac-vac-1-3d', 0, TRUE),
  ('rem-vac-1-1d', 'clinic-myvet-ouled-fayet', 'c1', 'nina', 'vac-1', 'VACCINATION_1D', '2026-08-19T08:00:00+01:00', 'Scheduled', 'vac-vac-1-1d', 0, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sms_logs (id, clinic_id, reminder_id, owner_id, animal_id, recipient_name, recipient_phone, animal_name, category, message_content, encoding, segment_count, status, is_simulated, provider_name, provider_message_id, provider_response)
VALUES
  ('log-1', 'clinic-myvet-ouled-fayet', 'rem-vac-1-7d', 'c1', 'nina', 'Fatima Mansouri', '+213555555555', 'Nina', 'VACCINATION_7D', 'Cabinet My Vet: Bonjour Fatima Mansouri, le rappel vaccin annuel pour Nina est prévu le 2026-08-20. Tel: 0797 63 87 04.', 'GSM-7', 1, 'Sent', TRUE, 'TestSMSProvider (Mode Simulation)', 'SIM-INIT-001', '{"mode":"TEST_SIMULATION","simulated":true,"carrier":"Ooredoo"}'::text),
  ('log-2', 'clinic-myvet-ouled-fayet', NULL, 'c3', 'felix', 'Samira Lambert', '+213678901234', 'Félix', 'APPOINTMENT_24H', 'Cabinet My Vet: Rappel de votre RDV pour Félix le 14/08/2026 à 14:00. Ouled Fayet.', 'GSM-7', 1, 'Delivered', TRUE, 'TestSMSProvider (Mode Simulation)', 'SIM-INIT-002', '{"mode":"TEST_SIMULATION","simulated":true,"carrier":"Mobilis","webhookConfirmed":true}'::text)
ON CONFLICT (id) DO NOTHING;
