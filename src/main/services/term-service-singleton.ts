import { TermService } from './term-service';

let instance: TermService | null = null;

export function initializeTermService(): TermService {
  instance = new TermService();
  return instance;
}

export function getTermService(): TermService {
  instance ??= new TermService();
  return instance;
}
