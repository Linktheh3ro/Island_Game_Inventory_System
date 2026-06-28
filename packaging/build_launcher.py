import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> None:
    if os.name != "nt":
        print("This script builds a Windows executable launcher. Run it on Windows.")
        return

    output_dir = ROOT / "dist"
    subprocess.run([
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--name",
        "charlock-beta-launcher",
        "--distpath",
        str(output_dir),
        str(ROOT.parent / "launcher.py"),
    ], check=True)

    root_exe = ROOT.parent / "charlock-beta-launcher.exe"
    print(f"Launcher built at: {output_dir / 'charlock-beta-launcher.exe'}")
    print("The build output remains in the packaging/dist folder to avoid duplicate executables in the repo root.")
    print("If you want a single copy in the project root, re-enable the copy step in this script.")


if __name__ == "__main__":
    main()
