import { autoUpdater } from 'electron';
import type { AutoUpdaterPort } from './update-ports';

/** Production adapter around Electron autoUpdater (Squirrel.Windows). */
export function createElectronAutoUpdaterPort(): AutoUpdaterPort {
  return autoUpdater as unknown as AutoUpdaterPort;
}
