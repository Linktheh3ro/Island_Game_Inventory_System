import os
import shutil
import subprocess
import sys
import textwrap
import time
import webbrowser
from pathlib import Path


def get_repo_root() -> Path:
    if getattr(sys, "frozen", False):
        candidate = Path(sys.executable).resolve()
    else:
        candidate = Path(__file__).resolve()

    for directory in [candidate.parent] + list(candidate.parents):
        if (directory / "backend").is_dir() and (directory / "frontend").is_dir():
            return directory

    return candidate.parent


ROOT = get_repo_root()
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
ENV_PATH = ROOT / ".env"
ENV_EXAMPLE_PATH = ROOT / ".env.example"


DEFAULT_ENV_VALUES = {
    "MONGO_URL": "mongodb://127.0.0.1:27017/charlock",
    "MONGO_USER": "admin",
    "MONGO_PASSWORD": "changeme",
    "DB_NAME": "charlock",
    "CORS_ORIGINS": "http://localhost:3000,http://127.0.0.1:3000",
    "REACT_APP_API_URL": "http://localhost:8000/api",
    "ENVIRONMENT": "beta",
}


def ensure_env_file() -> None:
    if ENV_PATH.exists():
        existing = {}
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            existing[key.strip()] = value.strip()

        for key, value in DEFAULT_ENV_VALUES.items():
            existing.setdefault(key, value)

        lines = []
        for key in ["MONGO_URL", "MONGO_USER", "MONGO_PASSWORD", "DB_NAME", "CORS_ORIGINS", "REACT_APP_API_URL", "ENVIRONMENT"]:
            lines.append(f"{key}={existing.get(key, DEFAULT_ENV_VALUES[key])}")
        ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return

    if ENV_EXAMPLE_PATH.exists():
        ENV_PATH.write_text(ENV_EXAMPLE_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    else:
        content = "\n".join(f"{key}={value}" for key, value in DEFAULT_ENV_VALUES.items()) + "\n"
        ENV_PATH.write_text(content, encoding="utf-8")


def find_python_executable() -> str:
    preferred = os.environ.get("PYTHON_EXE")
    if preferred and os.path.exists(preferred):
        return preferred

    for candidate in ["py", "python", "python3"]:
        resolved = shutil.which(candidate)
        if resolved:
            if candidate == "py":
                return resolved
            return resolved

    return sys.executable


def get_python_command() -> list[str]:
    python_exe = find_python_executable()
    if os.path.basename(python_exe).lower() == "py":
        return [python_exe, "-3"]
    return [python_exe]


def find_frontend_package_manager() -> list[str]:
    if os.name == "nt":
        for candidate in ["yarn.cmd", "yarn", "npm.cmd", "npm"]:
            resolved = shutil.which(candidate)
            if resolved:
                return [resolved]
    else:
        for candidate in ["yarn", "npm"]:
            resolved = shutil.which(candidate)
            if resolved:
                return [resolved]

    return []


def ensure_frontend_dependencies() -> list[str]:
    package_manager = find_frontend_package_manager()
    if not package_manager:
        raise RuntimeError("Node.js was not found. Install Node.js and npm (or Yarn) before launching the app.")

    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing frontend dependencies...")
        if package_manager[0].endswith("yarn") or package_manager[0].endswith("yarn.cmd"):
            subprocess.run(package_manager + ["install", "--frozen-lockfile"], cwd=FRONTEND_DIR, check=True)
        else:
            subprocess.run(package_manager + ["install"], cwd=FRONTEND_DIR, check=True)

    if package_manager[0].endswith("yarn") or package_manager[0].endswith("yarn.cmd"):
        return package_manager
    return package_manager


def ensure_backend_environment() -> Path:
    python_cmd = get_python_command()
    venv_dir = BACKEND_DIR / ".venv"
    if os.name == "nt":
        venv_python = venv_dir / "Scripts" / "python.exe"
    else:
        venv_python = venv_dir / "bin" / "python"

    if not venv_python.exists():
        print("Creating Python virtual environment for the backend...")
        subprocess.run(python_cmd + ["-m", "venv", str(venv_dir)], cwd=ROOT, check=True)

    print("Installing backend dependencies...")
    subprocess.run([str(venv_python), "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")], cwd=ROOT, check=True)
    return venv_python


def start_process(command: list[str], cwd: Path, name: str) -> subprocess.Popen:
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_CONSOLE
    return subprocess.Popen(command, cwd=str(cwd), creationflags=creationflags, stdout=None, stderr=None)


def launch() -> None:
    ensure_env_file()
    frontend_package_manager = ensure_frontend_dependencies()
    venv_python = ensure_backend_environment()

    backend_command = [str(venv_python), "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
    if frontend_package_manager[0].endswith("yarn") or frontend_package_manager[0].endswith("yarn.cmd"):
        frontend_command = frontend_package_manager + ["start"]
    else:
        frontend_command = frontend_package_manager + ["start"]

    print("Starting backend...")
    backend_process = start_process(backend_command, BACKEND_DIR, "backend")

    print("Starting frontend...")
    frontend_process = start_process(frontend_command, FRONTEND_DIR, "frontend")

    time.sleep(4)
    try:
        webbrowser.open("http://localhost:3000")
    except Exception:
        pass

    print("\nBackend: http://localhost:8000")
    print("Frontend: http://localhost:3000")
    print("Press Ctrl+C to stop both services.\n")

    try:
        while True:
            time.sleep(1)
            if backend_process.poll() is not None or frontend_process.poll() is not None:
                break
    except KeyboardInterrupt:
        pass
    finally:
        for process in [backend_process, frontend_process]:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in {"--check", "-check"}:
        ensure_env_file()
        print(f"Prepared configuration at {ENV_PATH}")
    else:
        launch()
