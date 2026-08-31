import type { KhepreeAccessService } from './khepree-access-service';
import { logger } from '../logging/logger';

export class KhepreeHeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly access: KhepreeAccessService) {}

  start(): void {
    this.stop();
    const tick = () => {
      void this.access.handleHeartbeat().catch((error: unknown) => {
        logger.warn('Khepree heartbeat tick failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    };
    tick();
    const intervalMs = this.access.getHeartbeatIntervalMs();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  restart(): void {
    this.start();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
