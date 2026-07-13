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

    subprocess.run([
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--windowed", # Hide console window
        "--name",
        "Character Vault",
        "--splash",
        str(PROJECT_ROOT / "splash.png"),
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

    # Copy to project root directory under both requested names
    dest_exe = PROJECT_ROOT / "Character Locker.exe"
    shutil.copy2(output_dir / "Character Vault.exe", dest_exe)
    
    dest_exe_vault = PROJECT_ROOT / "Character Vault.exe"
    shutil.copy2(output_dir / "Character Vault.exe", dest_exe_vault)

    print(f"\nStandalone executable built at: {dest_exe} and {dest_exe_vault}")

if __name__ == "__main__":
    main()
