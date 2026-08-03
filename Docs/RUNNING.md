# Running StrikeFluency Locally

This guide covers how to start the backend API and the frontend dev server for
local development.

## Prerequisites

- Python 3.11+ (backend virtualenv lives in `backend/venv`)
- Node.js 18+ and npm (frontend)
- PostgreSQL running locally with a `strikefluency` database
- A `backend/.env` file (copy from `backend/.env.example` and fill in values)

## Backend (FastAPI + Uvicorn)

Run from the `backend/` directory.

```bash
cd backend

# Activate the virtualenv (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Start the API with hot reload on port 8000
uvicorn app.main:app --reload --port 8000
```

- API base URL: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs

## Frontend (Vite dev server)

Run from the `frontend/` directory.

```bash
cd frontend

# Install dependencies (first time only)
npm install

# Start the dev server
npm run dev
```

- App URL: http://localhost:5173/

Vite proxies `/api` requests to the backend on port 8000, so keep the backend
running while you use the app.

## Typical dev workflow

Open two terminals:

| Terminal | Directory  | Command                                        | URL                   |
| -------- | ---------- | ---------------------------------------------- | --------------------- |
| 1        | `backend`  | `uvicorn app.main:app --reload --port 8000`    | http://localhost:8000 |
| 2        | `frontend` | `npm run dev`                                  | http://localhost:5173 |

Start the backend first, then the frontend, then open http://localhost:5173/ in
your browser.
