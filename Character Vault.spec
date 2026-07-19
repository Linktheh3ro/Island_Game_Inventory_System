# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['C:\\Users\\hayde\\OneDrive\\Documents\\IDE_Character_Locker-predev0.0.06\\standalone.py'],
    pathex=[],
    binaries=[],
    datas=[('C:\\Users\\hayde\\OneDrive\\Documents\\IDE_Character_Locker-predev0.0.06\\frontend\\build', 'frontend/build'), ('C:\\Users\\hayde\\OneDrive\\Documents\\IDE_Character_Locker-predev0.0.06\\backend', 'backend')],
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
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['C:\\Users\\hayde\\OneDrive\\Documents\\IDE_Character_Locker-predev0.0.06\\icon.ico'],
    contents_directory='.',
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
