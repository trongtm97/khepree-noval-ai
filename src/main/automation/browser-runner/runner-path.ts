import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve runner-entry.js for utilityProcess.fork().
 * Works in forge Vite dev (`.vite/build`) and packaged ASAR / asar.unpacked.
 * Never relies on ELECTRON_RUN_AS_NODE.
 */
export function resolveRunnerScriptPath(dirname = __dirname): string {
  const candidates = buildRunnerPathCandidates(dirname);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // asar / permission edge — try next
    }
  }
  // Last resort: primary path (fork will throw a clear error if missing)
  return candidates[0]!;
}

export function buildRunnerPathCandidates(dirname: string): string[] {
  const primary = path.join(dirname, 'runner-entry.js');
  const candidates = [primary];

  // Electron Forge asar.unpack → app.asar.unpacked/<same relative path>
  if (dirname.includes(`${path.sep}app.asar${path.sep}`) || dirname.endsWith(`${path.sep}app.asar`)) {
    candidates.push(primary.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`));
    candidates.push(primary.replace(/app\.asar(?![.\\/])/g, 'app.asar.unpacked'));
  }

  // Optional extraResource copy: resources/runner-entry.js
  if (typeof process !== 'undefined' && typeof process.resourcesPath === 'string') {
    candidates.push(path.join(process.resourcesPath, 'runner-entry.js'));
  }

  return [...new Set(candidates)];
}
