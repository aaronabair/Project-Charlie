# Project Charlie

Inspection tracking platform — replacement for the Excel-based BIDP workflow.

## Local setup

```bash
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev
```

## Deployment

Deployed via Netlify, connected to this repo. Build command: `npm run build`.
Publish directory: `dist`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
as environment variables in Netlify's site settings (same values as your `.env`).

## Build order

See the Project Charlie handoff doc for the full 14-step build plan.
This repo currently covers through Step 3 (React app foundation + routing).
