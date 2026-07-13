import os
import sys

# Disable GPU hardware acceleration for WebView2 to prevent focus/rendering deadlocks on startup
os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = "--disable-gpu"

import time
import socket
import threading
import uvicorn
import webview
from pathlib import Path

# Try to update PyInstaller splash screen text if running inside frozen executable
try:
    import pyi_splash
    pyi_splash.update_text("Initializing extraction...")
except ImportError:
    pyi_splash = None

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
        self.window = None

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
            
            if pid_file.exists():
                try:
                    old_pid = int(pid_file.read_text(encoding="utf-8").strip())
                    if old_pid not in (current_pid, parent_pid):
                        # Forcefully kill the previous process tree (main + all children)
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(old_pid)],
                            creationflags=0x08000000,
                            capture_output=True
                        )
                        # Wait for OS to release file handles
                        time.sleep(0.5)
                except Exception as e:
                    print("Error reading/killing previous PID:", e)
            
            pid_file.write_text(str(current_pid), encoding="utf-8")
        except Exception as e:
            print("Error in PID lockfile cleanup:", e)

    kill_previous_instance()

    if pyi_splash:
        pyi_splash.update_text("Selecting application port...")
        
    port = get_app_port()
    
    if pyi_splash:
        pyi_splash.update_text("Starting local server...")
        
    # Start uvicorn server in a background daemon thread
    t = threading.Thread(target=run_server, args=(port,), daemon=True)
    t.start()
    
    # Poll uvicorn until it starts accepting socket connections (up to 5.0 seconds)
    for i in range(100):
        if pyi_splash:
            pyi_splash.update_text(f"Waiting for backend readiness ({i}%)...")
        time.sleep(0.05)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.05)
        try:
            s.connect(('127.0.0.1', port))
            s.close()
            break
        except:
            pass

    if pyi_splash:
        pyi_splash.update_text("Launching interface...")
        time.sleep(0.1)
        pyi_splash.close()

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
    api.window = window

    # Enable private_mode=False and define storage_path to preserve LocalStorage
    storage_path = str(LOCAL_APP_DIR / ".webview_storage")
    webview.start(
        private_mode=False,
        storage_path=storage_path
    )
