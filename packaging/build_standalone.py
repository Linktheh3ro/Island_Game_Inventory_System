import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent

def main() -> None:
    if os.name != "nt":
        print("This script builds a Windows executable launcher. Run it on Windows.")
        return

    output_dir = PROJECT_ROOT / "dist"
    output_dir.mkdir(exist_ok=True)
    
    # We must specify frontend/build and backend directories as data files to include
    frontend_build = PROJECT_ROOT / "frontend" / "build"
    backend = PROJECT_ROOT / "backend"
    
    if not frontend_build.exists():
        raise RuntimeError("Frontend build folder not found. Run 'yarn build' inside frontend/ directory first.")

    # Clean up old single-file executables from the project root to prevent user confusion
    for old_exe in ["Character Locker.exe", "Character Vault.exe"]:
        old_exe_path = PROJECT_ROOT / old_exe
        if old_exe_path.exists():
            try:
                old_exe_path.unlink()
            except Exception as e:
                print(f"Failed to delete old root exe {old_exe}: {e}")

    # Clean up any leftover backend/.venv to prevent python314.dll dependency leakage into dist
    backend_venv = backend / ".venv"
    if backend_venv.exists():
        try:
            shutil.rmtree(backend_venv, ignore_errors=True)
            print("Cleaned up backend/.venv successfully.")
        except Exception as e:
            print(f"Warning: Failed to delete backend/.venv: {e}")

    subprocess.run([
        sys.executable,
        "-m",
        "PyInstaller",
        "--onedir",   # Compile to directory to avoid runtime extraction locks and Defender scans
        "--contents-directory", ".",  # Flatten: put all files alongside the exe, no _internal subfolder
        "--noconfirm", # Overwrite output directory without confirmation
        "--windowed", # Native GUI mode
        "--name",
        "Character Vault",
        "--icon",
        str(PROJECT_ROOT / "icon.ico"),
        "--add-data",
        f"{frontend_build};frontend/build",
        "--add-data",
        f"{backend};backend",
        "--distpath",
        str(output_dir),
        str(PROJECT_ROOT / "standalone.py"),
    ], check=True)

    # Create root level shortcuts pointing to the dist folder executable
    try:
        target_exe = output_dir / "Character Vault" / "Character Vault.exe"
        
        for shortcut_name in ["Character Locker.lnk", "Character Vault.lnk"]:
            shortcut_path = PROJECT_ROOT / shortcut_name
            s_path = str(shortcut_path).replace("'", "''")
            t_path = str(target_exe).replace("'", "''")
            w_path = str(target_exe.parent).replace("'", "''")
            
            ps_script = f"""
            $WshShell = New-Object -ComObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut('{s_path}')
            $Shortcut.TargetPath = '{t_path}'
            $Shortcut.WorkingDirectory = '{w_path}'
            $Shortcut.IconLocation = '{t_path},0'
            $Shortcut.Description = 'Character Locker & Vault'
            $Shortcut.Save()
            """
            subprocess.run(
                ["powershell", "-WindowStyle", "Hidden", "-Command", ps_script],
                creationflags=0x08000000,
                capture_output=True
            )
        print("\nShortcuts created in project root successfully.")
    except Exception as e:
        print("\nFailed to create project root shortcuts:", e)

    print(f"\nStandalone directory built at: {output_dir / 'Character Vault'}")

if __name__ == "__main__":
    main()
