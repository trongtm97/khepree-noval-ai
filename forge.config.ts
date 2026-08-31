import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Code signing — set via environment only. Never commit cert/password.
 *
 * WINDOWS_CERTIFICATE_FILE  — path to .pfx
 * WINDOWS_CERTIFICATE_PASSWORD
 * WINDOWS_CERTIFICATE_SUBJECT_NAME — optional alternative to file
 */
function windowsSignConfig():
  | {
      certificateFile?: string;
      certificatePassword?: string;
      signWithParams?: string;
    }
  | undefined {
  const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
  const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
  const subjectName = process.env.WINDOWS_CERTIFICATE_SUBJECT_NAME;

  if (certificateFile) {
    return {
      certificateFile,
      ...(certificatePassword ? { certificatePassword } : {}),
    };
  }
  if (subjectName) {
    return {
      signWithParams: `/a /n "${subjectName}" /fd sha256 /tr http://timestamp.digicert.com /td sha256`,
    };
  }
  return undefined;
}

const windowsSign = windowsSignConfig();

/** Keep Vite build + production externals (forge Vite ignores node_modules by default). */
function shouldPackagePath(file: string): boolean {
  if (!file) return true;
  if (file === '/package.json') return true;
  if (file.startsWith('/.vite')) return true;

  const keepPrefixes = [
    '/node_modules/better-sqlite3',
    '/node_modules/bindings',
    '/node_modules/file-uri-to-path',
    '/node_modules/playwright',
    '/node_modules/playwright-core',
  ];
  return keepPrefixes.some((p) => file === p || file.startsWith(`${p}/`));
}

const config: ForgeConfig = {
  packagerConfig: {
    // Unpack runner for utilityProcess.fork + native .node modules.
    asar: {
      unpack: '**/{*.node,runner-entry.js}',
    },
    // Override Vite plugin ignore so externals exist in packaged app.
    ignore: (file: string) => !shouldPackagePath(file),
    name: 'Khepree Novel AI',
    executableName: 'KhepreeNovelAI',
    appBundleId: 'com.khepree.novelai',
    appCopyright: `Copyright © ${new Date().getFullYear()} Khepree`,
    icon: path.join(__dirname, 'resources', 'icon'),
    // User data lives in %APPDATA%/KhepreeNovelAI — never under install dir.
    // Squirrel upgrades must not wipe AppData (DB, profiles, settings).
    // resources/workers: NovelTransGeminiWorker.exe only (no .venv / secrets / py source).
    extraResource: ['./resources/guides', './resources/workers'],
    ...(windowsSign
      ? {
          windowsSign: {
            ...windowsSign,
          },
        }
      : {}),
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'KhepreeNovelAI',
      title: 'Khepree Novel AI',
      authors: 'Khepree',
      description:
        'AI-assisted multilingual novel translation for Windows',
      setupExe: 'KhepreeNovelAISetup.exe',
      setupIcon: path.join(__dirname, 'resources', 'icon.ico'),
      noMsi: true,
      ...(windowsSign?.certificateFile
        ? {
            certificateFile: windowsSign.certificateFile,
            certificatePassword: windowsSign.certificatePassword,
          }
        : {}),
    }),
    new MakerZIP({}, ['darwin']),
  ],
  hooks: {
    /**
     * Vite plugin packages only `.vite/` — copy production externals so
     * utilityProcess runner (playwright) + main (better-sqlite3) resolve.
     */
    packageAfterCopy: (_config, buildPath): Promise<void> => {
      const projectDir = process.cwd();
      const modules = [
        'better-sqlite3',
        'bindings',
        'file-uri-to-path',
        'playwright',
        'playwright-core',
      ];
      for (const name of modules) {
        const src = path.join(projectDir, 'node_modules', name);
        const dest = path.join(buildPath, 'node_modules', name);
        if (!fs.existsSync(src)) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.cpSync(src, dest, { recursive: true });
      }
      return Promise.resolve();
    },
    /**
     * Warn when Windows release lacks bundled Gemini worker exe.
     * Browser provider still works without it.
     */
    postPackage: (_config, packageResult): Promise<void> => {
      if (process.platform !== 'win32') return Promise.resolve();
      const outputPaths = packageResult.outputPaths;
      let found = false;
      for (const out of outputPaths) {
        const workerExe = path.join(out, 'resources', 'workers', 'NovelTransGeminiWorker.exe');
        if (fs.existsSync(workerExe)) {
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn(
          '[forge] NovelTransGeminiWorker.exe missing under resources/workers — ' +
            'Web API optional; run npm run build:gemini-worker before make for full self-contained Web API.',
        );
      }
      return Promise.resolve();
    },
  },
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/main/automation/browser-runner/runner-entry.ts',
          config: 'vite.runner.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
