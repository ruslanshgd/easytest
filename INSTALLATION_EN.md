# Installation and Deployment Guide

## What This Is

Three tools for UX testing with Figma prototypes:
- **figma-plugin** — Figma plugin that creates prototypes
- **figma-viewer** — web app where respondents take tests
- **figma-analytics** — test builder and analytics dashboard

Supported block types: Welcome screen, Prototype testing, Open questions, Single/Multiple choice, Scale, Card sorting, Tree testing, Completion screen, Matrix, Agreement.

---

## Part 1: Installing on Your Computer

### Requirements

- **Node.js 20.19+** or **22.12+** (Vite 7 requires these versions)
- npm 10+

### Windows

1. Download Node.js: https://nodejs.org/
2. Install version **22.x LTS** (recommended)
3. Open a terminal: **Win + R** → type `cmd` (Command Prompt) or **Win + X** → "Terminal" / "Windows PowerShell"
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### macOS

1. Download Node.js: https://nodejs.org/
2. Install version **22.x LTS** (recommended)
3. Open Terminal (via Spotlight: Cmd + Space, type "Terminal")
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

> **Important:** If your Node.js version is below 20.19, please upgrade. Vite 7 requires modern Node.js versions.

---

## Part 2: Local Installation

### Step 1: Download the Project

If the project is in Git:
```bash
git clone [repository link]
cd figmaTest
```

If the project is in an archive — extract it to a folder.

### Step 2: Install Dependencies

Open terminal in the project folder and run:

**For figma-viewer:**
```bash
cd figma-viewer
npm install
```

**For figma-analytics:**
```bash
cd figma-analytics
npm install
```

**For figma-plugin:**
The plugin is installed via Figma Community, see details in [Part 3](#part-3-installing-plugin-in-figma).

### Step 3: Set Up Supabase

#### Option A: Supabase Cloud (Quick)

1. Go to https://supabase.com
2. Create an account
3. Create a new project
4. Wait for creation (2–3 minutes)
5. Open Settings → API
6. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (long string)

#### Option B: Supabase Self-Hosted (On Your Server)

**Requirements:**
- Server with Docker (Ubuntu 20.04+ or similar)
- Minimum 2 GB RAM
- 20 GB free space

**Installation:**

1. Connect to server via SSH
2. Install Docker and Docker Compose:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```
3. Download Supabase:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   ```
4. Copy settings file:
   ```bash
   cp .env.example .env
   ```
5. Open `.env` and configure:
   - `POSTGRES_PASSWORD` — database password
   - `JWT_SECRET` — random string (generate: `openssl rand -base64 32`)
   - `ANON_KEY` — random string (generate: `openssl rand -base64 32`)
   - `SERVICE_ROLE_KEY` — random string (generate: `openssl rand -base64 32`)
6. Start:
   ```bash
   docker-compose up -d
   ```
7. Wait 2–3 minutes, check:
   ```bash
   docker-compose ps
   ```
8. Open in browser: `http://your-ip:8000`
9. Create project via web interface
10. Get URL and keys in Settings → API

**Important:** For external access, configure firewall:
```bash
sudo ufw allow 8000/tcp
sudo ufw allow 5432/tcp
```

### Step 4: Create Database

In Supabase Dashboard:
1. Open **SQL Editor**
2. Run **six** migration files from the repo **`supabase/migrations/`** in order: `001_full_schema.sql`, `002_functions_triggers_rls.sql`, `003_storage.sql`, `004_send_email_hook.sql`, `005_grant_api_access.sql`, `006_cascade_delete_studies.sql` (copy each file's contents and click Run). Details: **[Part 5: Supabase on Your Server and Clean Database](#part-5-supabase-on-your-server-and-clean-database)** (section 5.2). For self-hosted email (login codes, password recovery), see **[5.6. Email (Send Email Hook)](#56-email-send-email-hook-self-hosted)**.

### Step 5: Configure Figma OAuth (Embed Kit 2.0)

For click analytics and screen transition tracking to work:

1. Go to [Figma Developer Console](https://www.figma.com/developers/apps)
2. Click **Create new app**
3. Fill the form:
   - **App name**: your app name (e.g., "EasyTest Viewer")
   - **Website URL**: your viewer URL (e.g., `https://viewer.your-domain.com`)
4. In **Allowed origins** section, add domains:
   - For development: `http://localhost:5173`
   - For production: `https://viewer.your-domain.com`
5. Save and copy the **Client ID**
6. Open `figma-viewer/src/TestView.tsx` and update the constant:
   ```typescript
   const FIGMA_CLIENT_ID = "your-client-id";
   ```

> **Important:** Without Figma OAuth setup, embed events (clicks, transitions) won't be tracked in analytics.

### Step 6: Configure Environment Variables

**For figma-viewer:**

Create `.env` file in `figma-viewer` folder:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**For figma-analytics:**

Create `.env` file in `figma-analytics` folder:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Step 7: Run Locally

**Run figma-viewer:**
```bash
cd figma-viewer
npm run dev
```
Opens at http://localhost:5173

**Run figma-analytics:**
```bash
cd figma-analytics
npm run dev
```
Opens at http://localhost:5174 (or another port, check terminal)

---

## Part 3: Installing Plugin in Figma

The plugin is published in Figma Community and can be installed automatically:

1. Open Figma Desktop or web version
2. Go to: [EasyTest in Figma Community](https://www.figma.com/community/plugin/1587860401738140185)
3. Click "Install" button
4. The plugin will appear in the menu: **Plugins → ИзиТест**

### First Plugin Setup

1. Run plugin: Plugins → Изи Тест
2. Fill the form:
   - **Supabase URL** — your Supabase project URL
   - **Supabase Anon Key** — anon key from Supabase
   - **Viewer URL** — for local development: `http://localhost:5173`
   - **Analytics URL** — for local development: `http://localhost:5174`
   - **Figma Personal Access Token** — token for Figma REST API access (get it in Figma Settings → Account → Personal Access Tokens)
3. Click "Save Settings"

### Working with Prototypes and Tests

**How it fits together:** Tests (studies) are created in **figma-analytics**: you add blocks (welcome, prototype, questions, etc.), folders, and publish the test. The Figma plugin is used to **import a Figma prototype** into a new or existing test and get a link to send to respondents.

**Creating a prototype in Figma:**
1. In Figma, create a prototype with flows (starting points) and transitions between frames
2. For each flow, mark the final screen — add `[final]` to the frame name
3. Ensure each flow has its own final screen (they can differ)

**Importing the prototype in the plugin:**
1. In Figma: Share → Copy link (copy the file link)
2. Run the **ИзиТест** plugin (Plugins → Изи Тест)
3. Click "Импортировать прототип" (Import prototype) and paste the link
4. If the file has multiple flows, select the one you need from the dropdown
5. Click "Использовать выбранный flow" (Use selected flow)
6. Check that the plugin identified the start and final screens correctly

**Sending for testing:**
1. Enter the task description for respondents (up to 250 characters)
2. Choose: **new test**, **existing test**, or **folder** (where to add the prototype)
3. Click "Отправить на тест" (Send for testing)
4. Copy the link and share it with respondents — they open it in the browser (viewer) and complete the test

**Important:**
- Each flow in Figma has its own screens and final screen; analytics shows only screens from the selected flow
- The full test builder (blocks, folders, publishing) is in **figma-analytics**; the plugin adds the ability to import a Figma prototype into a test

---

## Part 4: Deploying on Your Domain

You need three subdomains: **viewer**, **analytics**, and **api** (for Supabase when self-hosted on the same server). Add three A records pointing to your server IP; below are Nginx and SSL for all three.

### Step 1: Choose Hosting

**Options in Russia:**

1. **Reg.ru VPS**
   - Go to https://www.reg.ru
   - Choose VPS plan (from 200₽/month)
   - Operating system: Ubuntu 22.04

2. **Timeweb VPS**
   - Go to https://timeweb.com
   - Choose VPS plan
   - Operating system: Ubuntu 22.04

3. **Selectel VPS**
   - Go to https://selectel.ru
   - Choose VPS plan
   - Operating system: Ubuntu 22.04

### Step 2: Configure Server

1. Connect via SSH:
   ```bash
   ssh root@your-ip-address
   ```

2. Update system:
   ```bash
   apt update && apt upgrade -y
   ```

3. Install Node.js 22 LTS (as in Part 1):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt install -y nodejs
   ```

4. Install Nginx:
   ```bash
   apt install -y nginx
   ```

5. If Supabase will run on this server, install Docker:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```

6. Install PM2 (process manager):
   ```bash
   npm install -g pm2
   ```

### Step 3: Upload Project

1. Install Git:
   ```bash
   apt install -y git
   ```

2. Clone repository or upload files:
   ```bash
   cd /var/www
   git clone [repository link] figmaTest
   # or upload via SCP/SFTP
   ```

3. Install dependencies:
   ```bash
   cd /var/www/figmaTest/figma-viewer
   npm install
   npm run build
   
   cd /var/www/figmaTest/figma-analytics
   npm install
   npm run build
   ```

### Step 4: Configure Environment Variables on Server

**For figma-viewer:**
```bash
cd /var/www/figmaTest/figma-viewer
nano .env.production
```

Add:
```env
VITE_SUPABASE_URL=https://your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**For figma-analytics:**
```bash
cd /var/www/figmaTest/figma-analytics
nano .env.production
```

Add:
```env
VITE_SUPABASE_URL=https://your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VIEWER_URL=https://viewer.your-domain.com
```
`VITE_VIEWER_URL` ensures test links point to the viewer, not analytics.

**Important:** Rebuild after changing `.env`:
```bash
cd /var/www/figmaTest/figma-viewer && npm run build
cd /var/www/figmaTest/figma-analytics && npm run build
```

### Step 5: Configure Nginx

Create configuration for viewer:
```bash
nano /etc/nginx/sites-available/viewer
```

Add:
```nginx
server {
    listen 80;
    server_name viewer.your-domain.com;

    root /var/www/figmaTest/figma-viewer/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Create configuration for analytics:
```bash
nano /etc/nginx/sites-available/analytics
```

Add:
```nginx
server {
    listen 80;
    server_name analytics.your-domain.com;

    root /var/www/figmaTest/figma-analytics/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Third config — Supabase API** (when Supabase is self-hosted on this server):

```bash
nano /etc/nginx/sites-available/supabase-api
```

Add (replace with your domain):

```nginx
server {
    listen 80;
    server_name api.your-domain.com;
    client_max_body_size 10m;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

`client_max_body_size 10m` is required so the plugin can upload large prototypes (otherwise 413).

Activate configurations:
```bash
ln -s /etc/nginx/sites-available/viewer /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/supabase-api /etc/nginx/sites-enabled/
```

Check configuration:
```bash
nginx -t
```

Restart Nginx:
```bash
systemctl restart nginx
```

### Step 6: Configure Domain

1. Go to domain control panel (reg.ru, timeweb, etc.)
2. Add A records:
   - `viewer.your-domain.com` → your server IP
   - `analytics.your-domain.com` → your server IP
   - `api.your-domain.com` → your server IP (for Supabase when self-hosted)
3. Wait 10–30 minutes (for DNS to update)

### Step 7: Set Up SSL (HTTPS)

Install Certbot:
```bash
apt install -y certbot python3-certbot-nginx
```

Get certificates:
```bash
certbot --nginx -d viewer.your-domain.com
certbot --nginx -d analytics.your-domain.com
certbot --nginx -d api.your-domain.com
```

Certbot will automatically update Nginx configuration. After that set `VITE_SUPABASE_URL=https://api.your-domain.com` in `.env.production` (instead of IP:8000) and rebuild both apps.

### Step 8: Update Plugin Settings

1. Open Figma
2. Run plugin
3. Click "⚙️ Settings"
4. Update:
   - **Supabase URL**: `https://api.your-domain.com` (or your Supabase URL)
   - **Supabase Anon Key**: your anon key
   - **Viewer URL**: `https://viewer.your-domain.com`
   - **Analytics URL**: `https://analytics.your-domain.com`
   - **Figma Personal Access Token**: token from Figma (Account → Personal Access Tokens)
5. Save

---

## Part 5: Supabase on Your Server and Clean Database

Two scenarios: **Supabase Cloud** (free account) and **self-hosted** (your own server). In both cases the database schema is the same — all SQL scripts are in the repo, **with no data**: only tables, policies, RPCs, and Storage.

---

### 5.1. Where the migrations live

In the repo under **`supabase/migrations/`**:

| File | Contents |
|------|----------|
| **001_full_schema.sql** | Extensions (uuid-ossp, pgcrypto), all `public` tables, foreign keys, index on `events.session_id`. |
| **002_functions_triggers_rls.sql** | Functions and triggers (`set_user_id`, `is_team_member`, etc.), all RPCs (study run, teams, invitations), enable RLS, all table policies. |
| **003_storage.sql** | Storage buckets `recordings` and `study-images`, RLS on `storage.buckets`, policies for `storage.objects`. |
| **004_send_email_hook.sql** | Send Email Hook for Auth: send mail via HTTP API (Resend/Brevo) instead of SMTP. Required on self-hosted when ports 587/465 are blocked. |
| **005_grant_api_access.sql** | GRANTs for `anon` and `authenticated` — without these, Data API cannot access tables. |
| **006_cascade_delete_studies.sql** | Cascade delete when a study is removed: blocks, runs, responses. |

See **`supabase/migrations/README.md`** for more detail.

---

### 5.2. Clean install (Cloud or self-hosted)

#### Step 1: Create a Supabase project

- **Cloud:** Go to [supabase.com](https://supabase.com), create an account and a new project. Wait for it to be ready (2–3 minutes).
- **Self-hosted:** See section 5.4 below — deploy Supabase on your server first, then use its web UI.

#### Step 2: Apply migrations via SQL Editor

1. In Supabase Dashboard open **SQL Editor**.
2. Run the **six** migration files **in order**, each in full: `001_full_schema.sql`, then `002_functions_triggers_rls.sql`, `003_storage.sql`, `004_send_email_hook.sql`, `005_grant_api_access.sql`, `006_cascade_delete_studies.sql`.
3. In **004_send_email_hook.sql** replace `YOUR_RESEND_API_KEY` with your [Resend](https://resend.com) API key before running (if you need email via hook; on Cloud you can skip 004 or leave a placeholder).

If you get errors like "relation already exists" or "policy already exists", that object was already created (e.g. on a previous run). You can skip that part or remove the already-created objects from the script.

#### Step 3: Get URL and key

In Dashboard go to **Settings → API**. Copy:

- **Project URL** (e.g. `https://xxxxx.supabase.co`)
- **anon public** key

#### Step 4: Set env vars in the apps

In **figma-analytics** and **figma-viewer** create or edit `.env` at the project root:

```env
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Then you can run the apps (Part 2) and configure Figma OAuth (Part 2, Step 5).

---

### 5.3. What gets created (no data)

- **Tables:** `teams`, `folders`, `studies`, `study_blocks`, `study_shares`, `study_runs`, `study_block_responses`, `prototypes`, `sessions`, `events`, `gaze_points`, `team_members`, `team_invitations`. All with RLS.
- **RPCs:** `rpc_get_public_study`, `rpc_start_public_run`, `rpc_finish_run`, `rpc_submit_block_response`, `rpc_get_public_results`, `get_team_members_safe`, `get_team_invitations`, `create_team_and_migrate_resources`, `remove_team_member`, `accept_team_invitation`.
- **Storage:** Buckets `recordings` (session videos from viewer) and `study-images` (images in test blocks in analytics), with access policies.

No data from your current store or tables is included — schema only.

---

### 5.4. Self-hosted Supabase (on your server)

To run Supabase on the same or a separate server:

**Requirements:** Server with 4+ GB RAM, 50+ GB free space, Ubuntu 20.04+ (or similar), Docker and Docker Compose.

**Installation:**

1. Connect to the server via SSH.
2. Install Docker if needed:
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sh get-docker.sh
   ```
3. Clone and start Supabase:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   cp .env.example .env
   ```
4. In `.env` set:
   - `POSTGRES_PASSWORD` — database password
   - `JWT_SECRET` — random string (`openssl rand -base64 32`)
   - `ANON_KEY` and `SERVICE_ROLE_KEY` — generate or take from Supabase docs
5. Start:
   ```bash
   docker-compose up -d
   ```
6. Check: `docker-compose ps`. Open `http://your-ip:8000` in a browser.
7. Create a project in the web UI, then as in **5.2** open SQL Editor and run all six migrations (001 … 006) in order.

**Scripts for generating .env:** In the repo folder **`scripts/`** you will find helpers: `setup_env.sh` (creates .env with secrets in the Supabase directory) and `generate-supabase-keys.js` (generates valid ANON_KEY and SERVICE_ROLE_KEY as JWTs). Without JWT keys, Auth will not work. See **`scripts/README.md`** for details.

**Domain and SSL (optional):** Configure a subdomain (e.g. `api.your-domain.com`), Nginx as reverse proxy to port 8000, then `certbot --nginx -d api.your-domain.com`. In the apps' `.env` set `VITE_SUPABASE_URL=https://api.your-domain.com`. For production, in **figma-analytics** add `VITE_VIEWER_URL=https://viewer.your-domain.com` so test links point to the viewer.

---

### 5.6. Email (Send Email Hook) — self-hosted

Many VPS providers (e.g. Reg.ru) block outbound SMTP ports (587, 465). Login codes and password recovery emails then never arrive.

**Solution:** Send Email Hook — send mail via HTTP API (Resend or Brevo) on port 443.

1. Sign up at [resend.com](https://resend.com) and create an API key.
2. In **004_send_email_hook.sql** replace `YOUR_RESEND_API_KEY` with that key and run the file in SQL Editor (if you haven’t already).
3. On the server, in the Supabase directory, open `docker-compose.yml`, section **auth** → **environment**. Enable the hook:
   - `GOTRUE_HOOK_SEND_EMAIL_ENABLED: "true"`
   - `GOTRUE_HOOK_SEND_EMAIL_URI: "pg-functions://postgres/public/send_email_hook"`
   - `GOTRUE_HOOK_SEND_EMAIL_SECRETS: "v1,whsec_aXppdGVzdHNlY3JldGtleWZvcmVtYWls"`
4. Restart: `docker compose restart auth kong`.

Emails with codes will then go through Resend. Alternatively, Brevo is described in comments in `004_send_email_hook.sql`.

---

### 5.5. Relation to Part 2 (Step 4 "Create Database")

Step 4 in Part 2 is exactly **applying the repo migrations** (section 5.2 above). You don't need to create anything else by hand: tables, RLS, RPCs, and Storage are defined in `supabase/migrations/`.

---


## Part 6: Verification

### Locally

1. Run viewer: `cd figma-viewer && npm run dev`
2. Run analytics: `cd figma-analytics && npm run dev`
3. Open Figma, run plugin
4. Create prototype and send for testing
5. Open link in browser — should work

### On Server

1. Open `https://viewer.your-domain.com` — page should open
2. Open `https://analytics.your-domain.com` — analytics should open
3. In Figma, update plugin settings to production URL
4. Create prototype and verify it works

---

## What's Available to Users

Figma plugin: send a prototype to a new or existing test, to a folder or to the root; create folders, bulk move and delete tests. In the builder: templates and block types for creating tests; in the profile: team collaboration, invites, draft team invite link, and test publication.

---

## Common Issues

### Plugin Can't See Supabase

- Check that URL and key are correct
- Check that Supabase is running
- Check CORS settings in Supabase (all domains should be allowed)

### Viewer Won't Open

- Check that server is running
- Check Nginx configuration: `nginx -t`
- Check logs: `tail -f /var/log/nginx/error.log`

### Build Errors

- Make sure Node.js is 20.19+ or 22.12+ (see Part 1)
- Delete `node_modules` and `package-lock.json`, then `npm install`
- Check that `figma-viewer` and `figma-analytics` have `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

### DNS Not Working

- Wait up to 24 hours (usually 10–30 minutes)
- Check A records in domain panel
- Use `nslookup viewer.your-domain.com` to verify

### Storage: “Failed to retrieve buckets”

- Ensure **all six** migrations (001 … 006) have been run; 003 enables RLS on `storage.buckets`.
- Check: `docker compose ps storage`, and if needed `docker compose restart storage`.

### 504 when sending login code / emails not arriving

- Many VPS providers (e.g. Reg.ru) block SMTP ports (587, 465). Use **Send Email Hook** — see [section 5.6](#56-email-send-email-hook--self-hosted).

### CORS or 413 when sending prototype from plugin

- **413:** The Nginx config for `api.your-domain.com` must include `client_max_body_size 10m;` (see Step 5 in Part 4).
- **CORS:** The Figma plugin sends requests with `Origin: null`. In Kong, allow this origin: in `~/supabase/docker/volumes/api/kong.yml`, in the `cors` plugin for `rest-v1` and `auth-v1`, add `"null"` and your domains (viewer, analytics, api) to `origins`. Then run: `docker compose up -d --force-recreate kong`.

---

## Next Steps

- Set up database backups
- Set up server monitoring
- Set up automatic updates via CI/CD
- Add usage analytics

---

## Support

If something doesn't work:
1. Check logs in terminal
2. Check Nginx logs: `/var/log/nginx/error.log`
3. Check service status: `systemctl status nginx`
4. Check Docker containers: `docker-compose ps`

