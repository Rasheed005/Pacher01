# Pacher — Research Project Approval & Tracking System

A web application for final-year students to submit research **topics**, get them
**approved** by supervisors, and **track progress** chapter-by-chapter through to final
approval. A standalone **S-BERT semantic-similarity service** warns students (and informs
supervisors) when a topic is too close to existing work — it *warns by threshold, it never
blocks a submission*.

## Architecture

Three independent parts, wired together over HTTP:

```
  React SPA (Vite)                Express API (Node)              Flask S-BERT (Python)
  ────────────────                ──────────────────              ─────────────────────
  dev:  http://localhost:5173     http://localhost:3000           http://127.0.0.1:8000
        └── proxies /api ─────────►  /api/*  ──── server-to-server ───►  /similarity
  prod: built to frontend/dist                 │                        /health
        served by Express            Mongoose  ▼
                                              MongoDB (local or Atlas)
```

- **`frontend/`** — React 18 + React Router 6, built with **Vite**. In development the Vite
  dev server proxies `/api` to Express so the browser stays same-origin (session cookie +
  CSRF keep working). In production `npm run build` emits `frontend/dist`, which **Express
  serves directly** (no CORS).
- **`backend/`** — Express 4 + Mongoose 8. Session-cookie auth, the full REST API, all
  security middleware, and (in production) the static React bundle.
- **`sbert-service/`** — a standalone Python Flask service using
  `sentence-transformers`. Called **only by the backend**, never the browser. If it is down,
  the app keeps working and similarity is reported as *unavailable*.

## Prerequisites

- **Node.js ≥ 18** (backend + frontend build)
- **Python ≥ 3.9** with the S-BERT model already available in the local Hugging Face cache
- **MongoDB** — a local `mongod`, or a **MongoDB Atlas** connection string

## Setup & run

Run each part in its own terminal. Order doesn't strictly matter, but MongoDB must be
reachable before the backend starts.

### 1. S-BERT similarity service

```bash
cd sbert-service
pip install -r requirements.txt
python app.py
```

Serves on `http://127.0.0.1:8000`. Verify: `GET /health` → `{"status":"ok","model":"all-MiniLM-L6-v2"}`.
The model name is configurable via `SBERT_MODEL` (default `all-MiniLM-L6-v2`) and is loaded
from the local cache — no download / no internet needed.

### 2. Backend API

```bash
cd backend
cp .env.example .env       # then edit .env (see below)
npm install
npm run seed               # creates the super-admin from .env
npm run dev                # nodemon on http://localhost:3000
```

Edit `.env`:

- `MONGO_URI` — your local mongod URI **or** your **Atlas** `mongodb+srv://…` string.
  (Atlas users: make sure your current IP is on the Atlas Network Access allow-list.)
- `SESSION_SECRET` — a long random string.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the seeded super-admin login (default
  `admin@pacher.local` / `Admin@12345` — **change these**).
- `SBERT_URL`, `SIM_HIGH` (default `0.80`), `SIM_MODERATE` (default `0.60`) as needed.

### 3. Frontend (React)

**Development** — hot-reloading dev server (run alongside the backend):

```bash
cd frontend
npm install
npm run dev                # Vite on http://localhost:5173, proxies /api → :3000
```

Open **http://localhost:5173**.

**Production** — build once; Express then serves it on port 3000:

```bash
cd frontend
npm install
npm run build              # emits frontend/dist
```

Then open **http://localhost:3000** (served by the backend). Rebuild after frontend changes.

## Roles & workflow

- **Student** — self-registers, submits a topic (with live similarity check), then submits
  a document **link** for each of the 5 chapters (Introduction, Literature Review,
  Methodology, Results & Analysis, Conclusion), and tracks feedback + a full activity
  timeline.
- **Supervisor** — created **only** by the admin. Sees **only their own assigned students**,
  reviews the topic, each chapter, and the final project, leaving a **comment on every
  review** (append-only history). Cannot see or comment on any other supervisor's students.
- **Admin (super-admin)** — seeded on first run. Creates supervisors, manages/reassigns
  users, and views approval reports + S-BERT health.

Flow: **Topic → Chapters 1–5 → Final approval**. Chapters unlock only after the topic is
approved; final approval requires all chapters approved.

## Security — CIA triad (cross-cutting)

- **Confidentiality** — role-based access (`requireAuth` + `requireRole`); server-side
  ownership scoping (a supervisor querying another supervisor's project gets **403**, and it
  never appears in their list); passwords hashed with bcryptjs and `select:false` (never
  returned); `httpOnly` + `sameSite` session cookie; strict Helmet CSP; React escapes all
  user text.
- **Integrity** — `express-validator` on every endpoint; authorization on every state change
  (a student can't approve their own work); `express-mongo-sanitize` against NoSQL injection;
  double-submit **CSRF** token on state-changing requests; append-only `reviews[]` + a
  `timeline[]` audit trail.
- **Availability** — the S-BERT client is timeout-guarded and wrapped so a slow/down ML
  service degrades to *unavailable* instead of hanging Node; `express-rate-limit` on auth;
  a global async error handler; JSON body size cap.

## Verification checklist

1. `GET http://127.0.0.1:8000/health` → ok.
2. Register a student → submit a topic → **Check similarity** shows a warning band; a
   near-duplicate title scores high.
3. Log in as the seeded admin → create a supervisor → assign the student.
4. Log in as the supervisor → open the student → **request revision with a comment** →
   student resubmits → **comment again and approve** (both comments remain). Student submits
   chapter links → supervisor comments/approves each → final approval. The timeline reflects
   every step.
5. Stop the Python service and submit a topic → submission still succeeds, similarity shows
   *unavailable*.
6. **Security:** a second supervisor opening the first's project by ID → **403**; no API
   response contains `passwordHash`; a protected `/api` route with no session → **401**; a
   student cannot approve their own topic → **403**.

## Project layout

```
research-tracker/
├── backend/       Express API, Mongoose models, auth, security, serves dist in prod
├── frontend/      React + Vite SPA (src/), built to dist/
└── sbert-service/ standalone Python Flask similarity service
```
