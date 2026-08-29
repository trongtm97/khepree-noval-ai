import { PlaywrightBrowserAiService } from './playwright-browser-ai-service';
import { getDatabase } from '../db/connection';

let instance: PlaywrightBrowserAiService | null = null;

export function getPlaywrightBrowserAiService(): PlaywrightBrowserAiService {
  instance ??= new PlaywrightBrowserAiService(getDatabase());
  return instance;
}

export function resetPlaywrightBrowserAiServiceForTests(): void {
  instance = null;
}
