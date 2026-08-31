import type { KhepreeAccessService } from './khepree-access-service';
import { KHEPREE_DEFAULT_HEARTBEAT_MS } from '@shared/constants/khepree';
import { logger } from '../logging/logger';

/**
 * Main-process Khepree heartbeat scheduler.
 * Starts only when access status is ACTIVE; never runs in renderer.
 */
export class KhepreeHeartbeatService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;

  constructor(private readonly access: KhepreeAccessService) {}

  start(): void {
    // ponytail: idempotent — emit() after each tick must not restart the scheduler (was tight API loop / freeze).
    if (this.timer) return;

    const tick = () => {
      if (this.inFlight) return;
      this.inFlight = true;
      void this.access
        .handleHeartbeat()
        .catch((error: unknown) => {
          logger.warn('Khepree heartbeat tick failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          this.inFlight = false;
        });
    };
    tick();
    const intervalMs = this.resolveIntervalMs();
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

  /** Immediate validation — e.g. after Windows sleep/resume. */
  triggerNow(): void {
    if (this.inFlight) return;
    this.inFlight = true;
    void this.access
      .handleHeartbeat()
      .catch((error: unknown) => {
        logger.warn('Khepree immediate heartbeat failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.inFlight = false;
      });
  }

  private resolveIntervalMs(): number {
    return this.access.getHeartbeatIntervalMs() || KHEPREE_DEFAULT_HEARTBEAT_MS;
  }
}
