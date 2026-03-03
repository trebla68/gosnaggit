GoSnaggit Next.js Reboot (Frontend) + Existing Backend

This snapshot rolls back to last night's backend and starts a fresh Next.js (React) frontend.

Folders:
- backend/   -> your existing Node/Express app + APIs + worker (from 2026-02-01 snapshot)
- frontend/  -> NEW Next.js (React) UI (runs on port 3100)

Quick start:
1) Backend:
   cd backend
   npm install
   npm start    (serves APIs on http://127.0.0.1:3000)

   Worker (optional):
   npm run worker

2) Frontend:
   cd frontend
   npm install
   npm run dev  (http://127.0.0.1:3100)

Next steps:
- Wire frontend forms/pages to backend endpoints (we'll do this page-by-page).
- Keep a tokenized theme in frontend/app/globals.css (paper yellow + crimson).
