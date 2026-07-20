import datetime

# Helper function for dual-destination logging (console + files)
def log_diag(msg: str):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    line = f"[{timestamp}] {msg}"
    print(line, flush=True)

    # Determine log folder paths
    targets = []
    try:
        if getattr(sys, 'frozen', False):
            app_dir_logs = Path(sys.executable).parent / "logs"
        else:
            app_dir_logs = Path(__file__).parent / "logs"
        app_dir_logs.mkdir(parents=True, exist_ok=True)
        targets.append(app_dir_logs / "app_startup.log")
    except Exception:
        pass

    try:
        local_app_logs = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "CharacterVault" / "logs"
        local_app_logs.mkdir(parents=True, exist_ok=True)
        targets.append(local_app_logs / "app_startup.log")
    except Exception:
        pass

    for t in targets:
        try:
            with open(t, "a", encoding="utf-8") as f:
                f.write(line + "\n")
                f.flush()
        except Exception:
            pass

# ============================================================================
# CHILD PROCESS INTERCEPT: Must be the very first logic check.
# When this script is re-invoked by subprocess.Popen with "--server <port>",
# the child must ONLY start the uvicorn server and exit.
# ============================================================================
if "--server" in sys.argv:
    _server_idx = sys.argv.index("--server")
    _server_port = int(sys.argv[_server_idx + 1])

    log_diag(f"SERVER CHILD PROCESS STARTED: Port {_server_port}")

    # Setup paths for frozen environment
    if getattr(sys, 'frozen', False):
        _ROOT = Path(sys._MEIPASS).resolve()
    else:
        _ROOT = Path(__file__).resolve().parent
    sys.path.insert(0, str(_ROOT))

    log_diag("SERVER: Importing uvicorn and backend.server...")
    try:
        import uvicorn
        from backend.server import app
        log_diag("SERVER: Imports successful. Launching uvicorn server...")
        uvicorn.run(app, host="127.0.0.1", port=_server_port, log_level="info")
        log_diag("SERVER: uvicorn server finished cleanly.")
    except Exception as _err:
        import traceback
        log_diag(f"SERVER CRASH ERROR: {_err}\n{traceback.format_exc()}")
        raise _err
    sys.exit(0)

# ============================================================================
# MAIN GUI PROCESS: Only reached by the initial user-launched instance.
# ============================================================================

LOCAL_APP_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~\\AppData\\Local"))) / "CharacterVault"
LOCAL_APP_DIR.mkdir(parents=True, exist_ok=True)

log_diag("MAIN: Launcher initialized.")
log_diag(f"MAIN: sys.executable = {sys.executable}")
log_diag(f"MAIN: sys.argv = {sys.argv}")

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

# ── WebView2 Runtime Detection & Auto-Install ────────────────────────
def _check_webview2_installed():
    """Check if WebView2 is available — either via the standalone runtime OR Microsoft Edge (Chromium).
    
    WebView2 works if ANY of these are present:
    1. Standalone WebView2 Runtime (registered in EdgeUpdate registry)
    2. Microsoft Edge Chromium (bundles WebView2 internally)
    3. Edge executable found on disk
    """
    try:
        import winreg
        # GUIDs for EdgeUpdate client registration
        reg_paths = [
            # Standalone WebView2 Runtime
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEB-EB81BBE09C0B}"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEB-EB81BBE09C0B}"),
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BEB-EB81BBE09C0B}"),
            # Microsoft Edge Stable (Chromium-based — includes WebView2)
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}"),
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}"),
        ]
        for hive, key_path in reg_paths:
            try:
                with winreg.OpenKey(hive, key_path) as key:
                    val, _ = winreg.QueryValueEx(key, "pv")
                    if val and val != "0.0.0.0":
                        return True
            except FileNotFoundError:
                continue
            except Exception:
                continue

        # Fallback: check if Edge is registered in App Paths
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe") as key:
                edge_path, _ = winreg.QueryValueEx(key, "")
                if edge_path and Path(edge_path).exists():
                    return True
        except Exception:
            pass

    except Exception:
        # If we can't check registry at all (not on Windows), assume it's fine
        return True

    # Final fallback: check common Edge install locations on disk
    edge_paths = [
        Path(os.environ.get("PROGRAMFILES", "C:\\Program Files")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    for ep in edge_paths:
        if ep.exists():
            return True

    return False

def _show_message_box(title, message, style=0x00000040):
    """Show a native Windows MessageBox (doesn't require tkinter or webview)."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, title, style)
    except Exception:
        print(f"[MessageBox] {title}: {message}")

def _install_webview2():
    """Download and silently install the WebView2 Evergreen Bootstrapper from Microsoft."""
    import subprocess
    import tempfile
    import urllib.request

    url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
    bootstrapper_path = Path(tempfile.gettempdir()) / "MicrosoftEdgeWebview2Setup.exe"

    try:
        _show_message_box(
            "Character Vault — Installing WebView2",
            "The Microsoft Edge WebView2 Runtime is required but was not found.\n\n"
            "It will now be downloaded and installed automatically.\n"
            "This is a one-time setup and only takes a moment.\n\n"
            "Click OK to continue.",
            0x00000040  # MB_ICONINFORMATION
        )

        # Download the bootstrapper
        print(f"Downloading WebView2 bootstrapper from {url}...")
        urllib.request.urlretrieve(url, str(bootstrapper_path))
        print(f"Downloaded to {bootstrapper_path}")

        # Run the bootstrapper silently
        print("Running WebView2 installer...")
        result = subprocess.run(
            [str(bootstrapper_path), "/silent", "/install"],
            capture_output=True,
            timeout=120
        )
        print(f"WebView2 installer exited with code: {result.returncode}")

        # Clean up
        try:
            bootstrapper_path.unlink()
        except Exception:
            pass

        if result.returncode == 0:
            return True
        else:
            print(f"WebView2 installer stderr: {result.stderr}")
            return False
    except Exception as e:
        print(f"WebView2 auto-install failed: {e}")
        return False

def _ensure_webview2():
    """Ensure WebView2 is installed, attempting auto-install if missing."""
    if _check_webview2_installed():
        return True

    print("WebView2 Runtime not detected. Attempting auto-install...")

    if _install_webview2():
        # Verify installation succeeded
        if _check_webview2_installed():
            print("WebView2 installed successfully.")
            return True

    # Auto-install failed — show manual instructions
    _show_message_box(
        "Character Vault — WebView2 Required",
        "The Microsoft Edge WebView2 Runtime is required but could not be installed automatically.\n\n"
        "Please install it manually:\n"
        "1. Visit: https://developer.microsoft.com/en-us/microsoft-edge/webview2\n"
        "2. Download the 'Evergreen Bootstrapper'\n"
        "3. Run the installer\n"
        "4. Restart Character Vault\n\n"
        "The application will now exit.",
        0x00000010  # MB_ICONERROR
    )
    return False

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

        log_diag("MAIN: Executing kill_previous_instance check...")
        kill_previous_instance()

        port = get_app_port()
        log_diag(f"MAIN: Allocated port {port} for local FastAPI server.")
        
        # Start FastAPI server in a separate child process
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

        log_diag(f"MAIN: Spawning child server process: {server_cmd}")

        # In diagnostic mode, let child process output print to console
        server_process = subprocess.Popen(
            server_cmd,
            env=env
        )
        
        log_diag("MAIN: Polling server socket 127.0.0.1...")
        server_ready = False
        for i in range(100):
            time.sleep(0.05)
            if server_process.poll() is not None:
                log_diag(f"MAIN ERROR: Server child process died prematurely with return code {server_process.poll()}!")
                break
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.05)
            try:
                s.connect(('127.0.0.1', port))
                s.close()
                server_ready = True
                log_diag(f"MAIN: Connected to server socket on port {port} after {i+1} attempts!")
                break
            except:
                pass

        if not server_ready:
            log_diag("MAIN ERROR: Server failed to accept socket connections after 5.0 seconds.")
            # Gather log output to show user why server failed
            server_log_path = LOCAL_APP_DIR / "backend_server.log"
            log_detail = ""
            if server_log_path.exists():
                try:
                    lines = server_log_path.read_text(encoding="utf-8", errors="replace").splitlines()
                    log_detail = "\n".join(lines[-15:])
                except Exception:
                    pass
            if not log_detail:
                log_detail = f"Server child process exited with code {server_process.poll()}."

            _show_message_box(
                "Character Vault — Backend Startup Error",
                "The background server process failed to start or was blocked.\n\n"
                f"Log Summary:\n{log_detail}\n\n"
                "Please check if your antivirus software is blocking the application.",
                0x00000010  # MB_ICONERROR
            )
            try:
                server_process.terminate()
            except Exception:
                pass
            sys.exit(1)

        # Initialize JS API bridge
        log_diag("MAIN: Initializing DesktopAPI JS bridge...")
        api = DesktopAPI()

        import urllib.parse
        exe_name = Path(sys.executable).stem if getattr(sys, 'frozen', False) else "Character Locker"
        if exe_name.startswith("_MEI") or len(exe_name) == 0:
            exe_name = "Character Locker"
            
        quoted_title = urllib.parse.quote("Character Vault")

        log_diag("MAIN: Checking WebView2 Runtime installation...")
        if not _ensure_webview2():
            log_diag("MAIN ERROR: WebView2 Runtime is not available. Exiting.")
            try:
                server_process.terminate()
            except Exception:
                pass
            sys.exit(1)

        log_diag("MAIN: Creating webview window...")
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

        storage_path = str(LOCAL_APP_DIR / ".webview_storage")
        
        lock_file = LOCAL_APP_DIR / ".webview_storage" / "EBWebView" / "LOCKfile"
        if lock_file.exists():
            log_diag("MAIN: Cleaning up stale EBWebView LOCKfile...")
            try:
                lock_file.unlink()
            except Exception as _e:
                log_diag(f"MAIN WARNING: Could not unlink LOCKfile: {_e}")

        log_diag(f"MAIN: Starting webview.start() with storage_path={storage_path}...")
        try:
            webview.start(
                private_mode=False,
                storage_path=storage_path
            )
            log_diag("MAIN: webview.start() exited normally.")
        except Exception as start_err:
            log_diag(f"MAIN ERROR: webview.start() failed: {start_err}")
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
