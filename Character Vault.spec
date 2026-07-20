# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\hayde\\OneDrive\\Documents\\Character Valt Root\\standalone.py'],
    pathex=[],
    binaries=[],
    datas=[('C:\\Users\\hayde\\OneDrive\\Documents\\Character Valt Root\\frontend\\build', 'frontend/build'), ('C:\\Users\\hayde\\OneDrive\\Documents\\Character Valt Root\\backend', 'backend')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Character Vault',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['C:\\Users\\hayde\\OneDrive\\Documents\\Character Valt Root\\icon.ico'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='Character Vault',
)
