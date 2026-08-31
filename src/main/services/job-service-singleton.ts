import { JobService } from './job-service';
import { getDatabase } from '../db/connection';

let instance: JobService | null = null;

export function initializeJobService(): JobService {
  instance = new JobService(getDatabase());
  return instance;
}

export function getJobService(): JobService {
  instance ??= new JobService(getDatabase());
  return instance;
}

export function resetJobServiceForTests(): void {
  instance = null;
}

export function setJobServiceForTests(service: JobService | null): void {
  instance = service;
}
