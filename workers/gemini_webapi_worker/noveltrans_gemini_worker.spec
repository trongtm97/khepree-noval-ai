# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec — build NovelTransGeminiWorker.exe for Windows packaging.

Run via: node scripts/build-gemini-worker.mjs
Or: pyinstaller workers/gemini_webapi_worker/noveltrans_gemini_worker.spec
"""

from pathlib import Path

block_cipher = None
worker_dir = Path(SPECPATH)

a = Analysis(
    [str(worker_dir / 'main.py')],
    pathex=[str(worker_dir)],
    binaries=[],
    datas=[],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'gemini_webapi',
        'auth',
        'session_manager',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='NovelTransGeminiWorker',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
