import os
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
        str(ROOT / "launcher.py"),
    ], check=True)
    print(f"Launcher built at: {output_dir / 'charlock-beta-launcher.exe'}")


if __name__ == "__main__":
    main()
