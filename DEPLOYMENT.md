# MyVet — Guide de Déploiement Production (Vercel + Supabase PostgreSQL)

Ce document décrit la procédure complète de mise en production de **MyVet** (gestion vétérinaire, Algérie — devise **DZD**) sur **Vercel** avec une base managée **Supabase PostgreSQL**.

---

## 1. Prérequis

1. Compte **Supabase** (projet PostgreSQL créé dans une région proche de l'Algérie, ex. `eu-west-3` Paris ou `eu-central-1` Francfort).
2. Compte **Vercel** relié à votre dépôt GitHub.
3. Node.js 20+ en local pour l'initialisation du schéma SQL.

---

## 2. Configuration de Supabase PostgreSQL

1. Dans le tableau de bord Supabase : **Project Settings → Database → Connection string**.
2. Copiez l'URI du **Transaction Pooler (port `6543`)** ou **Session Pooler** :
   ```
   postgresql://postgres.<PROJECT_REF>:<MOT_DE_PASSE>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require
   ```
3. Appliquez le schéma SQL (24 tables, contraintes `ON DELETE RESTRICT`, politiques RLS, montants DZD en centimes `BIGINT`) et les données initiales depuis votre terminal local :
   ```bash
   export DATABASE_URL="postgresql://postgres.<PROJECT_REF>:<MOT_DE_PASSE>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?sslmode=require"
   npm run db:migrate
   npm run db:seed
   ```
   > `npm run db:migrate` exécute de façon idempotente `database/migrations/001_initial_schema.sql` et trace l'historique dans `schema_migrations`.
   > `npm run db:seed` charge le cabinet par défaut (`My Vet — Ouled Fayet`), le second cabinet démo (`Clinique Vétérinaire Hydra`), les comptes staff et les données de base.

---

## 3. Variables d'environnement (Vercel Project Settings → Environment Variables)

Configurez **uniquement côté serveur** (ne jamais préfixer les secrets par `VITE_`) :

| Variable | Obligatoire en Prod | Description |
| --- | :---: | --- |
| `NODE_ENV` | Oui | `production` |
| `DATABASE_URL` | Oui | URI PostgreSQL Supabase (`?sslmode=require`) |
| `SESSION_SECRET` | Oui | Chaîne aléatoire ≥ 32 caractères (`openssl rand -hex 32`) pour signer les cookies HTTP-only HMAC-SHA256 |
| `CRON_SECRET` | Oui | Secret Bearer protégeant `/api/cron/process-reminders` (Vercel Cron) |
| `APP_URL` | Recommandé | URL publique de production (ex. `https://myvet-dz.vercel.app`) |
| `AUTO_DEV_LOGIN` | Recommandé | `false` (de toute façon ignoré dès que `NODE_ENV=production`) |
| `SMS_PROVIDER_MODE` | Oui | `TEST` (par défaut, simulation sans facturation) ou `PRODUCTION` |
| `SMS_API_URL` | Si SMS Prod | Endpoint HTTP de votre agrégateur SMS algérien (Ooredoo / Mobilis / Djezzy) |
| `SMS_API_KEY` | Si SMS Prod | Clé API ou Bearer token opérateur |
| `SMS_SENDER_ID` | Optionnel | `MyVet` par défaut |
| `SMS_WEBHOOK_SECRET` | Optionnel | Secret HMAC-SHA256 vérifiant l'en-tête `x-sms-signature` sur `POST /api/sms/webhook` |

> **Comportement Fail-Closed en Production :**
> Si `DATABASE_URL` est absent en `NODE_ENV=production`, le serveur refuse tout repli en mémoire ou `localStorage` et renvoie **HTTP 503 (`DATABASE_UNAVAILABLE`)**.

---

## 4. Comptes Staff & Authentification

En développement local (`NODE_ENV !== 'production'` et `AUTO_DEV_LOGIN !== 'false'`), le cabinet s'ouvre automatiquement avec le compte `dr.vet@myvet.dz`.  
En production (`NODE_ENV=production`), la connexion stricte est exigée via `/api/auth/login` :

- **Administrateur multi-cabinets :** `dr.vet@myvet.dz` / `MyVet2026!`
- **Vétérinaire :** `dr.martin@myvet.dz` / `MyVet2026!`
- **Réceptionniste :** `accueil@myvet.dz` / `MyVet2026!`

> **Action immédiate post-déploiement :** changez les mots de passe par défaut via une migration ou hash `scrypt` avant d'ouvrir le cabinet aux utilisateurs finaux.

---

## 5. Déploiement sur Vercel & Architecture Serverless

Le dépôt inclut `vercel.json` :
- **Build :** `npm run build` (`vite build`, sortie dans `dist/`)
- **Fonctions Serverless (`/api/*`) :**
  - `api/[...slug].ts` — routeur API complet (Auth, Clinique, Patients, Clients, RDV, Dossiers médicaux, Vaccinations, Tâches, Stocks, Factures DZD, Clôture de caisse DZD, Hospitalisations, Rapports, SMS, Migration)
  - `api/health.ts` — sonde de santé PostgreSQL (`200 ok` ou `503 unhealthy`)
  - `api/cron/process-reminders.ts` — processeur de rappels SMS protégé par `Authorization: Bearer <CRON_SECRET>`

### Cron Vercel (Plan Hobby vs Plan Pro / Externe)
- **`vercel.json` (Plan Hobby compatible) :** déclenche `GET /api/cron/process-reminders` chaque jour à `08:00 UTC` (`"schedule": "0 8 * * *"`).
- **Fréquence toutes les 15 minutes (recommandé en clinique active) :**
  - Sur Vercel Pro, modifiez le schedule en `"*/15 * * * *"`, **ou**
  - Sur plan Hobby, utilisez un planificateur externe (cron-job.org, GitHub Actions, UptimeRobot) appelant `POST https://<votre-domaine>/api/cron/process-reminders` avec l'en-tête `Authorization: Bearer <CRON_SECRET>`.
- L' Engine utilise `SELECT ... FOR UPDATE SKIP LOCKED` avec baux de verrouillage (`lease_expires_at`), garantissant l'absence de doublons d'envoi même en exécution concurrente.

---

## 6. Checklist SMS Algérie : TEST → PRODUCTION

1. **En phase TEST (`SMS_PROVIDER_MODE=TEST`) :**
   - Tous les numéros sont normalisés en E.164 Algérie (`+213 5/6/7...`) avec détection Ooredoo (`05`), Mobilis (`06`), Djezzy (`07`).
   - La segmentation GSM-7 (160 car.) vs UCS-2/Arabe (70 car.) est calculée et journalisée dans `sms_logs` avec `is_simulated = true` sans frais télécom.
2. **Passage en PRODUCTION :**
   - Renseignez `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID=MyVet` et (si supporté par votre fournisseur) `SMS_WEBHOOK_SECRET` dans Vercel.
   - Passez `SMS_PROVIDER_MODE=PRODUCTION` (ou activez `Mode Production` dans **SMS & Notifications → Paramètres & Abonnement**).
   - Configurez le webhook de retour opérateur sur `https://<votre-domaine>/api/sms/webhook`.

---

## 7. Migration des données existantes (`localStorage`)

Si un poste utilisait l'ancienne version navigateur (`vetosuite:data:v1` ou clés `vetosuite_*`) :
1. Ouvrez **Paramètres du cabinet → Base PostgreSQL & Migration**.
2. Cliquez sur **Télécharger une sauvegarde JSON** (conservation locale intacte).
3. Cliquez sur **Aperçu (Dry Run)** pour vérifier le décompte des enregistrements qui seront importés.
4. Cliquez sur **Migrer vers PostgreSQL** : l'import est transactionnel, idempotent (anti-doublon via `migration_imports`) et convertit les montants en **DZD**. Le `localStorage` du navigateur n'est jamais supprimé automatiquement.
