# Installation and Deployment Guide

## What This Is

Three tools for UX testing with Figma prototypes:
- **figma-plugin** — Figma plugin that creates prototypes
- **figma-viewer** — web app where respondents take tests
- **figma-analytics** — test builder and analytics dashboard

Supported block types: Welcome screen, Prototype testing, Open questions, Single/Multiple choice, Scale, Card sorting, Tree testing, Completion screen.

---

## Part 1: Installing on Your Computer

### Requirements

- **Node.js 20.19+** or **22.12+** (Vite 7 requires these versions)
- npm 10+

### Windows

1. Download Node.js: https://nodejs.org/
2. Install version **22.x LTS** (recommended)
3. Open Command Prompt (Win + R, type `cmd`)
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
1. Open SQL Editor
2. Create tables (if you have SQL script, run it)
3. Configure RLS (Row Level Security) policies

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

### Working with Prototypes and Flows

**Creating Prototype in Figma:**
1. Create a prototype with flows (starting points) in Figma
2. For each flow, define a final screen — add `[final]` to the frame name
3. Make sure each flow has its own final screen (they can differ)

**Importing Prototype in Plugin:**
1. In Figma, copy Share link (Share → Copy link)
2. Run ИзиТест plugin
3. Click "Импортировать прототип" (Import prototype)
4. Paste Share link
5. If the file has multiple flows, select the needed one from the dropdown
6. Click "Использовать выбранный flow" (Use selected flow)
7. Check that the plugin correctly identified start and final screens

**Sending for Testing:**
1. Enter task description for respondents (up to 250 characters)
2. Click "Отправить на тест" (Send for testing)
3. Copy the link for respondents
4. Respondents will open the link in browser and complete the test

**Important:**
- Each flow has its own screens and final screen
- Analytics shows only screens from the selected flow
- When creating multiple prototypes from the same file with different flows, each will have its own screens in analytics

---

## Part 4: Deploying on Your Domain

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

3. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   ```

4. Install Nginx:
   ```bash
   apt install -y nginx
   ```

5. Install PM2 (process manager):
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
```

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

Activate configurations:
```bash
ln -s /etc/nginx/sites-available/viewer /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/
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
```

Certbot will automatically update Nginx configuration.

### Step 8: Update Plugin Settings

1. Open Figma
2. Run plugin
3. Click "⚙️ Settings"
4. Update:
   - **Viewer URL**: `https://viewer.your-domain.com`
   - **Analytics URL**: `https://analytics.your-domain.com`
5. Save

---

## Part 5: Supabase on Your Server

If you want to host Supabase on the same or separate server:

### Requirements

- Server with 4+ GB RAM
- 50+ GB free space
- Ubuntu 20.04+ or similar
- Docker and Docker Compose

### Installation

1. Connect to server
2. Install Docker (see above)
3. Download Supabase:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   ```
4. Configure `.env` (see above)
5. Start:
   ```bash
   docker-compose up -d
   ```
6. Check status:
   ```bash
   docker-compose ps
   ```
7. Open: `http://your-ip:8000`

### Configure Domain for Supabase

1. Set up subdomain (e.g., `api.your-domain.com`)
2. Configure Nginx as reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name api.your-domain.com;

       location / {
           proxy_pass http://localhost:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```
3. Get SSL certificate:
   ```bash
   certbot --nginx -d api.your-domain.com
   ```

### Update URL in Projects

In `.env` files, replace URL with yours:
```env
VITE_SUPABASE_URL=https://api.your-domain.com
```

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

- Make sure Node.js is version 18+
- Delete `node_modules` and `package-lock.json`, then `npm install`
- Check that all environment variables are filled

### DNS Not Working

- Wait up to 24 hours (usually 10–30 minutes)
- Check A records in domain panel
- Use `nslookup viewer.your-domain.com` to verify

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

