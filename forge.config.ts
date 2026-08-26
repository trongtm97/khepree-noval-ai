import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

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

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'NovelTrans Studio',
    executableName: 'NovelTransStudio',
    appBundleId: 'com.noveltrans.studio',
    appCopyright: `Copyright © ${new Date().getFullYear()} NovelTrans Studio`,
    // User data lives in %APPDATA%/NovelTrans — never under install dir.
    // Squirrel upgrades must not wipe AppData (DB, profiles, settings).
    extraResource: ['./resources/guides'],
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
      name: 'NovelTransStudio',
      title: 'NovelTrans Studio',
      authors: 'NovelTrans Studio',
      description:
        'Chinese to Vietnamese novel translation via browser-automated Gemini',
      setupExe: 'NovelTransStudioSetup.exe',
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
