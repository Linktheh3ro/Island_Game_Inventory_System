# CharLock Neo

## What this repo contains
- `backend/` — FastAPI backend server
- `frontend/` — React frontend app
- `packaging/` — beta packaging and launcher tooling
- `README.md` — current project launch instructions
- `docker-compose.yml` — optional cloud/local Docker compose setup

## Local beta launch
This repo is now packaged for local beta testers.

### Recommended start
Use one of these from the project root:
- `start-dev.bat`
- `start-dev.ps1`

Those scripts launch the repo-root launcher at `launcher.py`.

### Direct exe start
If you want the packaged release, run:
- `charlock-beta-launcher.exe`

The launcher will:
- create a `.env` file automatically if needed
- install backend dependencies into `backend\.venv`
- install frontend dependencies into `frontend\node_modules`
- [Windows only] download a portable Node.js runtime automatically if Node/npm is missing
- start the backend at `http://localhost:8000`
- open the frontend at `http://localhost:3000`

## Notes for testers
- Keep the launcher process running while you use the app.
- If you want to use a remote MongoDB URL instead of local Mongo, create a `.env` file in the repo root before starting.
- The default `.env` uses `mongodb://127.0.0.1:27017/charlock`.

## Packaging files and build tools
Packaging-related build tools and outputs remain under `packaging/`:
- `launcher.py` — Python launcher script in the repo root
- `packaging\build-launcher.bat` — build script for the EXE
- `packaging\build_launcher.py` — PyInstaller builder
- `packaging\dist\charlock-beta-launcher.exe` — built launcher output
- `charlock-beta-launcher.exe` — the launcher copy for testers in the repo root

## When you need to rebuild the exe
From the repo root, run:
- `packaging\build-launcher.bat`

## Optional local development
If you prefer manual startup for development:
- `python launcher.py`

## Minimal root layout
The root now keeps only the essentials:
- `backend/`
- `frontend/`
- `packaging/`
- `README.md`
- `docker-compose.yml`
- `DEPLOYMENT.md`
- `start-dev.bat`
- `start-dev.ps1`
- `.env` / `.env.example`

This structure keeps the beta workflow clean while preserving the launcher and documentation in the repo.
