# Ethan's Terminal

Bloomberg-inspired private fund-manager terminal for `terminal.neurovelo.com`.

## Stack

- **Frontend:** Next.js App Router on Vercel
- **Auth + Database:** Supabase Auth + Postgres
- **Analytics backend:** FastAPI + yfinance
- **UI:** Custom Bloomberg-style CSS + Recharts

## Features

- private email/password login
- one-page terminal view for MKT / PORT / RISK
- separate ADMIN area
- editable portfolio settings page with save-to-database workflow
- market snapshot, regime monitor, alerts, cross-asset chart
- portfolio summary, positions monitor, history chart
- risk table and weight concentration chart
- 60-second auto refresh with batched Yahoo Finance downloads
- lightweight 55-second backend response cache to limit repeated requests

## Local setup

### 1. Copy env file

```bash
cp .env.example .env.local
```

Fill in your real Supabase URL and keys. Keep `NEXT_PUBLIC_REFRESH_MS=60000` unless you have changed your data provider.

### 2. Install frontend deps

```bash
npm install
```

### 3. Install backend deps

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Create Supabase project

- create a new Supabase project
- run the SQL in `supabase/migrations/001_init.sql` in the SQL editor
- copy the project URL, anon key, and service role key into `.env.local`

### 5. Create initial user

```bash
npm run create:user
```

### 6. Seed the default portfolio

```bash
npm run seed:portfolio
```

### 7. Run locally

```bash
npm run dev
```

That starts:
- Next.js on `http://localhost:3000`
- FastAPI on `http://127.0.0.1:8000`

The terminal view refreshes every 60 seconds by default and includes a manual **Refresh Now** button.

## Vercel deployment

### Frontend

1. Push this repo to GitHub
2. Import the repo into Vercel
3. Add these environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL`
   - `NEXT_PUBLIC_API_BASE` (set to `/api` in production)
   - `SUPABASE_SERVICE_ROLE_KEY` (only if you plan to run admin scripts or secure server actions from Vercel)
4. Add your custom domain `terminal.neurovelo.com`

### API

The repository includes a FastAPI app in `api/index.py` for Vercel's Python runtime.

## Where to manage the portfolio

Use:

- `/admin/portfolio`

Every field for a position is editable there:
- type
- ticker
- display name
- shares/contracts
- avg cost
- cash value
- currency
- contract multiplier
- beta
- current price override
- delta
- beta override

## Security note

Do **not** commit a live `.env.local` file to Git.
Store real credentials only in environment variables.
