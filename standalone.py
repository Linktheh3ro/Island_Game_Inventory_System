import os
import sys
from pathlib import Path

# ============================================================================
# CHILD PROCESS INTERCEPT: Must be the very first logic check.
# When this script is re-invoked by subprocess.Popen with "--server <port>",
# the child must ONLY start the uvicorn server and exit. Without this guard,
# frozen PyInstaller executables re-execute the entire script including the
# GUI/subprocess spawn code, causing an infinite fork bomb of new windows.
# ============================================================================
if "--server" in sys.argv:
    _server_idx = sys.argv.index("--server")
    _server_port = int(sys.argv[_server_idx + 1])

    # Setup paths for frozen environment
    if getattr(sys, 'frozen', False):
        _ROOT = Path(sys._MEIPASS).resolve()
    else:
        _ROOT = Path(__file__).resolve().parent
    sys.path.insert(0, str(_ROOT))

    # Redirect stdout/stderr for the child server process
    _LOCAL_APP_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "CharacterVault"
    _LOCAL_APP_DIR.mkdir(parents=True, exist_ok=True)
    _log_file = open(_LOCAL_APP_DIR / "backend_server.log", "w", encoding="utf-8", buffering=1)
    sys.stdout = _log_file
    sys.stderr = _log_file

    import uvicorn
    from backend.server import app
    uvicorn.run(app, host="127.0.0.1", port=_server_port, log_level="warning")
    sys.exit(0)

# ============================================================================
# MAIN GUI PROCESS: Only reached by the initial user-launched instance.
# ============================================================================

# Redirect stdout and stderr early to capture all startup exceptions and uvicorn logs
LOCAL_APP_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "CharacterVault"
LOCAL_APP_DIR.mkdir(parents=True, exist_ok=True)
log_file = open(LOCAL_APP_DIR / "app.log", "w", encoding="utf-8", buffering=1)
sys.stdout = log_file
sys.stderr = log_file

import time
import socket
import threading
import uvicorn
from pathlib import Path

# Get root directory
if getattr(sys, 'frozen', False):
    ROOT = Path(sys._MEIPASS).resolve()
    USER_DATA_DIR = Path(sys.executable).parent.resolve()
else:
    ROOT = Path(__file__).resolve().parent
    USER_DATA_DIR = Path(__file__).resolve().parent

# Make sure path is inserted early so Python can find uvicorn and app
sys.path.insert(0, str(ROOT))

# Now import the backend app
from backend.server import app

# Main initialization starts below


import webview

pyi_splash = None

def get_app_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port

def run_server(port):
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

class DesktopAPI:
    def __init__(self):
        self._window = None

    def get_desktop_path(self):
        """Resolves the user's active desktop directory using the Windows Registry,
        ensuring correct OneDrive folder redirection support."""
        try:
            import winreg
            key_path = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                val, _ = winreg.QueryValueEx(key, "Desktop")
                # Expand environment variables like %USERPROFILE% in registry paths
                return Path(os.path.expandvars(val)).resolve()
        except Exception as e:
            print("Failed to read Desktop path from registry, falling back:", e)
            return Path(os.path.expanduser("~/Desktop")).resolve()

    def check_shortcut(self):
        """Checks if the desktop shortcut exists."""
        try:
            desktop = self.get_desktop_path()
            shortcut_path = desktop / "Character Vault.lnk"
            return shortcut_path.exists()
        except Exception as e:
            print("Error checking shortcut:", e)
            return False

    def create_shortcut(self):
        """Creates a desktop shortcut using Windows Script Host COM interface asynchronously."""
        def builder():
            try:
                import subprocess
                desktop = self.get_desktop_path()
                shortcut_path = desktop / "Character Vault.lnk"
                target_exe = Path(sys.executable).resolve()
                icon_path = target_exe
                working_dir = target_exe.parent

                # Escape paths for PowerShell script compilation
                s_path = str(shortcut_path).replace("'", "''")
                t_path = str(target_exe).replace("'", "''")
                w_path = str(working_dir).replace("'", "''")
                i_path = str(icon_path).replace("'", "''")

                ps_script = f"""
                $WshShell = New-Object -ComObject WScript.Shell
                $Shortcut = $WshShell.CreateShortcut('{s_path}')
                $Shortcut.TargetPath = '{t_path}'
                $Shortcut.WorkingDirectory = '{w_path}'
                $Shortcut.IconLocation = '{i_path},0'
                $Shortcut.Description = 'Character Locker & Vault'
                $Shortcut.Save()
                """
                
                subprocess.run(
                    ["powershell", "-WindowStyle", "Hidden", "-Command", ps_script],
                    creationflags=0x08000000,
                    capture_output=True
                )
            except Exception as e:
                print("Failed to create shortcut in background thread:", e)

        # Run shortcut creation in a background thread to prevent WebView2 main loop deadlocks
        threading.Thread(target=builder, daemon=True).start()
        return True

if __name__ == "__main__":
    try:
        # Create persistent, un-synced storage directory in LocalAppData to avoid OneDrive locking deadlocks
        LOCAL_APP_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "CharacterVault"
        LOCAL_APP_DIR.mkdir(parents=True, exist_ok=True)
        def kill_previous_instance():
            try:
                import os
                import subprocess
                pid_file = LOCAL_APP_DIR / "character_vault.pid"
                current_pid = os.getpid()
                parent_pid = os.getppid()
                
                # Always use current PID. Never use parent_pid as that would target explorer.exe when double-clicked!
                root_pid = current_pid
                
                if pid_file.exists():
                    try:
                        old_pid = int(pid_file.read_text(encoding="utf-8").strip())
                        if old_pid not in (current_pid, parent_pid):
                            # Verify the process name before killing to prevent killing explorer.exe or recycled system PIDs
                            check = subprocess.run(
                                ["tasklist", "/FI", f"PID eq {old_pid}", "/FO", "CSV", "/NH"],
                                creationflags=0x08000000,
                                capture_output=True,
                                text=True
                            )
                            if "Character" in check.stdout or "python" in check.stdout or "webview" in check.stdout:
                                # Forcefully kill the previous process tree
                                subprocess.run(
                                    ["taskkill", "/F", "/T", "/PID", str(old_pid)],
                                    creationflags=0x08000000,
                                    capture_output=True
                                )
                                # Wait for OS to release file handles and directories
                                time.sleep(0.5)
                    except Exception as e:
                        print("Error reading/killing previous PID:", e)
                
                pid_file.write_text(str(root_pid), encoding="utf-8")
            except Exception as e:
                print("Error in PID lockfile cleanup:", e)

        kill_previous_instance()

        port = get_app_port()
        
        # Start FastAPI server in a separate background child process (prevents Python GIL deadlock unresponsiveness)
        import subprocess
        server_cmd = [sys.executable]
        if not getattr(sys, 'frozen', False):
            server_cmd = [sys.executable, __file__]
        server_cmd.extend(["--server", str(port)])
        
        # Configure child environment paths (critical for frozen packages imports)
        env = os.environ.copy()
        if getattr(sys, 'frozen', False):
            env["_MEIPASS"] = sys._MEIPASS
        env["PYTHONPATH"] = str(ROOT) + os.pathsep + env.get("PYTHONPATH", "")

        # Child process handles its own log redirection internally via the --server intercept
        server_process = subprocess.Popen(
            server_cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            creationflags=0x08000000 # CREATE_NO_WINDOW: hide child cmd terminal window
        )
        
        # Poll uvicorn until it starts accepting socket connections (up to 5.0 seconds)
        for i in range(100):
            time.sleep(0.05)
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.05)
            try:
                s.connect(('127.0.0.1', port))
                s.close()
                break
            except:
                pass

        # Initialize JS API bridge
        api = DesktopAPI()

        import urllib.parse
        exe_name = Path(sys.executable).stem if getattr(sys, 'frozen', False) else "Character Locker"
        # Fallback to a cleaner name if it is just a temp file
        if exe_name.startswith("_MEI") or len(exe_name) == 0:
            exe_name = "Character Locker"
            
        quoted_title = urllib.parse.quote("Character Vault")

        # Open standalone native window (frameless=False to use native title bar)
        window = webview.create_window(
            "Character Vault",
            f"http://127.0.0.1:{port}?native=true&title={quoted_title}",
            width=1280,
            height=800,
            resizable=True,
            frameless=False,
            js_api=api
        )
        api._window = window

        # Enable private_mode=False and define storage_path to preserve LocalStorage
        storage_path = str(LOCAL_APP_DIR / ".webview_storage")
        try:
            webview.start(
                private_mode=False,
                storage_path=storage_path
            )
        except Exception as start_err:
            print("Webview failed to start, likely due to corrupted cache. Attempting recovery deletion...", start_err)
            try:
                import shutil
                shutil.rmtree(storage_path, ignore_errors=True)
                time.sleep(0.5)
                # Retry starting webview
                webview.start(
                    private_mode=False,
                    storage_path=storage_path
                )
            except Exception as retry_err:
                print("Recovery failed:", retry_err)
                raise retry_err

        # Clean up backend server child process gracefully on window exit
        try:
            # 1. Attempt a graceful shutdown via HTTP request
            import urllib.request
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{port}/api/shutdown", timeout=2)
            except Exception as e:
                print("Graceful shutdown request failed:", e)
                
            # 2. Wait up to 3.0s for the child process to exit cleanly and release its temp folder locks
            try:
                server_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                # 3. Fallback to taskkill /F /T if it hangs
                subprocess.run(
                    f"taskkill /F /T /PID {server_process.pid}",
                    shell=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                server_process.wait(timeout=1)
        except Exception as e:
            print("Error during server cleanup:", e)
    except Exception as e:
        import traceback
        print("Unhandled app startup crash:", e)
        traceback.print_exc()
        try:
            log_file.flush()
            log_file.close()
        except:
            pass
        sys.exit(1)
