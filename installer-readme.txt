CharLock Neo Beta Launcher
==========================

This package is intended for local beta testing.

How to run:
1. Make sure Python 3 and Yarn are installed.
2. Copy .env.example to .env and update it with your MongoDB connection string.
3. Run start-dev.bat on Windows.
4. The app will open in your browser at http://localhost:3000.

Notes:
- The launcher will create a Python virtual environment for the backend if needed.
- The launcher will install frontend dependencies the first time it runs.
- The backend API will be available at http://localhost:8000.
