import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
import zipfile
from pathlib import Path


NODE_VERSION = "v20.24.1"
NODE_DIST_NAME = f"node-{NODE_VERSION}-win-x64"
NODE_DOWNLOAD_URL = f"https://nodejs.org/dist/{NODE_VERSION}/{NODE_DIST_NAME}.zip"

# Python installer settings (Windows)
PYTHON_INSTALLER_VERSION = "3.11.6"
PYTHON_INSTALLER_NAME = f"python-{PYTHON_INSTALLER_VERSION}-amd64.exe"
PYTHON_INSTALLER_URL = f"https://www.python.org/ftp/python/{PYTHON_INSTALLER_VERSION}/{PYTHON_INSTALLER_NAME}"


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
    "MONGO_URL": "mongodb+srv://<db_username>:<db_password>@cluster0.9hdkznt.mongodb.net/?appName=Cluster0",
    "MONGO_USER": "haydentpointer_db_user",
    "MONGO_PASSWORD": "admin01",
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


def get_local_node_package_manager() -> list[str]:
    if os.name != "nt":
        return []

    node_root = ROOT / ".nodejs" / NODE_VERSION
    npm_cmd = node_root / "npm.cmd"
    if npm_cmd.exists():
        return [str(npm_cmd)]

    nested_root = node_root / NODE_DIST_NAME
    if nested_root.exists():
        nested_npm_cmd = nested_root / "npm.cmd"
        if nested_npm_cmd.exists():
            return [str(nested_npm_cmd)]

    return []


def download_node_windows() -> list[str]:
    if os.name != "nt":
        return []

    node_root = ROOT / ".nodejs" / NODE_VERSION
    npm_cmd = node_root / "npm.cmd"
    if npm_cmd.exists():
        return [str(npm_cmd)]

    node_root.mkdir(parents=True, exist_ok=True)
    zip_path = node_root / f"{NODE_DIST_NAME}.zip"

    print(f"Downloading Node.js {NODE_VERSION} for Windows...")
    try:
        with urllib.request.urlopen(NODE_DOWNLOAD_URL) as response, open(zip_path, "wb") as out_file:
            shutil.copyfileobj(response, out_file)
    except Exception as exc:
        raise RuntimeError(
            "Failed to download Node.js. Please check your network connection and try again."
        ) from exc

    print("Extracting Node.js...")
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(node_root)

    try:
        zip_path.unlink()
    except OSError:
        pass

    if not npm_cmd.exists():
        nested_root = node_root / NODE_DIST_NAME
        if nested_root.exists():
            for child in nested_root.iterdir():
                destination = node_root / child.name
                if destination.exists():
                    if destination.is_dir():
                        shutil.rmtree(destination)
                    else:
                        destination.unlink()
                shutil.move(str(child), str(destination))
            try:
                nested_root.rmdir()
            except OSError:
                pass

    if not npm_cmd.exists():
        raise RuntimeError("Node.js download completed but npm.cmd was not found in the extracted archive.")

    return [str(npm_cmd)]


def find_installed_python_paths() -> list[Path]:
    """Return a list of candidate python.exe paths found on the system."""
    candidates: list[Path] = []
    # check PATH-first candidates
    for name in ("python.exe", "python3.exe", "py.exe"):
        resolved = shutil.which(name)
        if resolved:
            candidates.append(Path(resolved))

    # common per-user install location
    local_appdata = os.environ.get("LOCALAPPDATA")
    if local_appdata:
        base = Path(local_appdata) / "Programs" / "Python"
        if base.exists():
            for child in sorted(base.iterdir(), reverse=True):
                py = child / "python.exe"
                if py.exists():
                    candidates.append(py)

    # dedupe while preserving order
    seen = set()
    out = []
    for p in candidates:
        try:
            key = str(p.resolve())
        except Exception:
            key = str(p)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def download_and_run_python_installer_windows() -> Path | None:
    """Download the official Python Windows installer and run a per-user silent install.

    Returns the path to the installed python.exe if successful, otherwise None.
    """
    if os.name != "nt":
        return None

    installer_dir = ROOT / ".python_installer"
    installer_dir.mkdir(parents=True, exist_ok=True)
    installer_path = installer_dir / PYTHON_INSTALLER_NAME

    print(f"Downloading Python {PYTHON_INSTALLER_VERSION}...")
    try:
        with urllib.request.urlopen(PYTHON_INSTALLER_URL) as response, open(installer_path, "wb") as out_file:
            shutil.copyfileobj(response, out_file)
    except Exception as exc:
        print("Failed to download Python installer:", exc)
        return None

    print("Running Python installer (silent, per-user)...")
    try:
        # Per-user silent install; Include_pip and PrependPath so pip and python are available.
        subprocess.run([str(installer_path), "/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_pip=1"], check=True)
    except subprocess.CalledProcessError as exc:
        print("Python installer failed:", exc)
        return None

    # Look for installed python.exe in common locations
    for p in find_installed_python_paths():
        return p

    return None


def find_frontend_package_manager() -> list[str]:
    if os.name == "nt":
        if (FRONTEND_DIR / "yarn.lock").exists():
            for candidate in ["yarn.cmd", "yarn"]:
                resolved = shutil.which(candidate)
                if resolved:
                    return [resolved]

        for candidate in ["npm.cmd", "npm"]:
            resolved = shutil.which(candidate)
            if resolved:
                return [resolved]

        local_manager = get_local_node_package_manager()
        if local_manager:
            return local_manager

        return download_node_windows()
    else:
        if (FRONTEND_DIR / "yarn.lock").exists():
            for candidate in ["yarn"]:
                resolved = shutil.which(candidate)
                if resolved:
                    return [resolved]

            # Yarn is expected for this frontend layout; fall back to npm but install yarn if possible.
            for candidate in ["npm"]:
                resolved = shutil.which(candidate)
                if resolved:
                    return [resolved]

        for candidate in ["npm"]:
            resolved = shutil.which(candidate)
            if resolved:
                return [resolved]

    return []


def ensure_frontend_dependencies() -> list[str]:
    package_manager = find_frontend_package_manager()
    if not package_manager:
        raise RuntimeError("Node.js was not found. Install Node.js and npm (or Yarn) before launching the app.")

    def install_yarn_globally() -> list[str] | None:
        print("Yarn is required for this frontend project. Installing yarn globally via npm...")
        subprocess.run(package_manager + ["install", "-g", "yarn@1.22.22"], check=True)
        yarn_cmd = shutil.which("yarn") or shutil.which("yarn.cmd")
        if yarn_cmd:
            return [yarn_cmd]
        return None

    def use_npx_yarn() -> list[str] | None:
        print("Falling back to npx to run yarn without a global install...")
        npx_cmd = shutil.which("npx") or shutil.which("npx.cmd")
        if npx_cmd:
            return [npx_cmd, "--yes", "yarn@1.22.22"]
        return None

    if (FRONTEND_DIR / "yarn.lock").exists() and not (shutil.which("yarn") or shutil.which("yarn.cmd")):
        if package_manager[0].endswith("npm") or package_manager[0].endswith("npm.cmd"):
            yarn_manager = None
            try:
                yarn_manager = install_yarn_globally()
            except subprocess.CalledProcessError as exc:
                print("Global yarn install failed:", exc)
                yarn_manager = use_npx_yarn()

            if yarn_manager:
                package_manager = yarn_manager

    if not (FRONTEND_DIR / "node_modules").exists():
        print("Installing frontend dependencies...")
        if package_manager[0].endswith("yarn") or package_manager[0].endswith("yarn.cmd") or (len(package_manager) > 1 and package_manager[1] == "--yes"):
            subprocess.run(package_manager + ["install", "--frozen-lockfile"], cwd=FRONTEND_DIR, check=True)
        else:
            subprocess.run(package_manager + ["install", "--legacy-peer-deps"], cwd=FRONTEND_DIR, check=True)

    return package_manager


def ensure_backend_environment() -> Path:
    venv_dir = BACKEND_DIR / ".venv"
    # Prepare candidate python commands to try creating the venv with.
    candidate_cmds: list[list[str]] = []

    # Primary preference from environment and discovery logic
    primary = get_python_command()
    if primary:
        candidate_cmds.append(primary)

    # Common executable names resolved by shutil.which
    for name in ("python", "python3", "py"):
        resolved = shutil.which(name)
        if resolved:
            candidate_cmds.append([resolved])

    # Always try the current interpreter as a last resort
    if sys.executable:
        candidate_cmds.append([sys.executable])

    # Deduplicate candidates and filter to likely-Python executables only
    seen: set[str] = set()
    filtered: list[list[str]] = []
    for cmd in candidate_cmds:
        key = str(Path(cmd[0]).resolve())
        if key in seen:
            continue
        seen.add(key)

        name = Path(cmd[0]).name.lower()
        # Accept candidates that look like Python interpreters (heuristic)
        if ("python" in name) or (name == "py") or name.startswith("python") or name.endswith("py"):
            filtered.append(cmd)
        else:
            # skip non-python executables (for example, the frozen launcher exe)
            print(f"Skipping non-Python candidate: {cmd[0]}")

    last_exc: Exception | None = None

    # Attempt to create the venv using each candidate until one succeeds
    for cmd in filtered:
        try:
            if os.name == "nt":
                venv_python = venv_dir / "Scripts" / "python.exe"
            else:
                venv_python = venv_dir / "bin" / "python"

            if not venv_python.exists():
                print(f"Creating Python virtual environment for the backend using: {cmd[0]}")
                subprocess.run(cmd + ["-m", "venv", str(venv_dir)], cwd=ROOT, check=True)

            # If we reach here, venv exists (or was just created)
            print("Installing backend dependencies...")
            subprocess.run([str(venv_python), "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")], cwd=ROOT, check=True)
            return venv_python
        except subprocess.CalledProcessError as exc:
            # remember the last failure and try the next candidate
            last_exc = exc
            print(f"Python candidate {cmd[0]} failed to create venv (exit {getattr(exc, 'returncode', '?')}). Trying next candidate...")
        except Exception as exc:  # pragma: no cover - diagnostics
            last_exc = exc
            print(f"Unexpected error while creating venv with {cmd[0]}: {exc}")

    # If we get here, none of the candidates worked. On Windows offer to download+install Python.
    if os.name == "nt":
        try:
            resp = input("No usable Python was found. Allow the launcher to download and install Python 3.11 for you? [y/N]: ")
        except Exception:
            resp = "n"

        if str(resp).strip().lower().startswith("y"):
            installed = download_and_run_python_installer_windows()
            if installed:
                print(f"Detected installed Python at: {installed}")
                # try creating venv with this python
                try:
                    if os.name == "nt":
                        venv_python = venv_dir / "Scripts" / "python.exe"
                    else:
                        venv_python = venv_dir / "bin" / "python"

                    print(f"Creating Python virtual environment for the backend using: {installed}")
                    subprocess.run([str(installed), "-m", "venv", str(venv_dir)], cwd=ROOT, check=True)
                    print("Installing backend dependencies...")
                    subprocess.run([str(venv_python), "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")], cwd=ROOT, check=True)
                    return venv_python
                except Exception as exc:  # pragma: no cover - retry failure
                    last_exc = exc
                    print("Failed to create venv with the newly installed Python:", exc)

    msg = (
        "Unable to create a Python virtual environment for the backend.\n"
        "Please ensure Python 3.8+ is installed and available on the PATH.\n"
        "You can also set the environment variable PYTHON_EXE to the full path of a Python executable.\n"
    )
    if last_exc:
        msg += f"Last error: {last_exc}\n"
    raise RuntimeError(msg)


def start_process(command: list[str], cwd: Path, name: str) -> subprocess.Popen:
    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_CONSOLE
    env = os.environ.copy()
    env["BROWSER"] = "none"
    return subprocess.Popen(command, cwd=str(cwd), creationflags=creationflags, stdout=None, stderr=None, env=env)


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
