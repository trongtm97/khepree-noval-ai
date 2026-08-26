import { LearningService } from './learning-service';
import { getDatabase } from '../db/connection';

let instance: LearningService | null = null;

export function getLearningService(): LearningService {
  instance ??= new LearningService(getDatabase());
  return instance;
}

export function resetLearningServiceForTests(): void {
  instance = null;
}
