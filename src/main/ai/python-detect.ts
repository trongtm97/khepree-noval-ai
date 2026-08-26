import fs from 'node:fs';
import path from 'node:path';

/** Python 3.11–3.19 and 3.20+. */
export const PYTHON_VERSION_RE = /Python 3\.(1[1-9]|[2-9]\d)/;

export function isSupportedPythonVersionOutput(text: string): boolean {
  return PYTHON_VERSION_RE.test(text);
}

/** Windows py launcher + PATH names. `py -3` picks latest 3.x (e.g. 3.14). */
export const WINDOWS_PYTHON_COMMANDS = [
  'py -3',
  'py -3.14',
  'py -3.13',
  'py -3.12',
  'py -3.11',
  'python',
  'python3',
];

export const POSIX_PYTHON_COMMANDS = ['python3.12', 'python3.11', 'python3', 'python'];

export function listWindowsPythonExecutables(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const roots = [
    path.join(env.LOCALAPPDATA ?? '', 'Programs', 'Python'),
    path.join(env.ProgramFiles ?? '', 'Python'),
    path.join(env['ProgramFiles(x86)'] ?? '', 'Python'),
  ].filter((root) => root.replace(/[/\\]$/, '').length > 0);

  const found: { exe: string; minor: number }[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let dirs: string[] = [];
    try {
      dirs = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const dir of dirs) {
      const match = dir.match(/^Python3(\d+)$/i);
      if (!match) continue;
      const minor = Number(match[1]);
      if (minor < 11) continue;
      const exe = path.join(root, dir, 'python.exe');
      if (fs.existsSync(exe)) found.push({ exe, minor });
    }
  }
  found.sort((a, b) => b.minor - a.minor);
  return found.map((item) => item.exe);
}

export function pythonDetectCommands(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') {
    return [...listWindowsPythonExecutables(), ...WINDOWS_PYTHON_COMMANDS];
  }
  return POSIX_PYTHON_COMMANDS;
}
