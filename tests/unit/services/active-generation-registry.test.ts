import { describe, expect, it, vi } from 'vitest';
import { ActiveGenerationRegistry } from '@main/services/active-generation-registry';
import { newId } from '@main/db/utils/uuid';

describe('ActiveGenerationRegistry concurrency', () => {
  it('Cancel A while B runs — B cancel handle still exists', async () => {
    const reg = new ActiveGenerationRegistry();
    const cancelA = vi.fn(() => Promise.resolve());
    const cancelB = vi.fn(() => Promise.resolve());
    const corrA = newId();
    const corrB = newId();
    const accountA = newId();
    const accountB = newId();

    reg.register({
      correlationId: corrA,
      accountId: accountA,
      startedAt: Date.now(),
      cancel: cancelA,
    });
    reg.register({
      correlationId: corrB,
      accountId: accountB,
      startedAt: Date.now(),
      cancel: cancelB,
    });

    expect(reg.size()).toBe(2);

    const cancelled = await reg.cancel(corrA);
    expect(cancelled).toBe(true);
    expect(cancelA).toHaveBeenCalledOnce();
    expect(cancelB).not.toHaveBeenCalled();

    // A complete → unregister A only
    reg.unregister(corrA);
    expect(reg.size()).toBe(1);
    expect(reg.get(corrB)).toBeTruthy();
    expect(reg.listByAccount(accountB)).toEqual([corrB]);

    // B cancellation handle still works
    const cancelledB = await reg.cancel(corrB);
    expect(cancelledB).toBe(true);
    expect(cancelB).toHaveBeenCalledOnce();

    reg.unregister(corrB);
    expect(reg.isEmpty()).toBe(true);
  });

  it('A finally must not delete B', () => {
    const reg = new ActiveGenerationRegistry();
    const corrA = 'corr-a';
    const corrB = 'corr-b';
    reg.register({
      correlationId: corrA,
      accountId: 'acc-a',
      startedAt: 1,
      cancel: () => Promise.resolve(),
    });
    reg.register({
      correlationId: corrB,
      accountId: 'acc-b',
      startedAt: 2,
      cancel: () => Promise.resolve(),
    });

    reg.unregister(corrA);
    expect(reg.get(corrA)).toBeUndefined();
    expect(reg.get(corrB)?.correlationId).toBe(corrB);
    expect(reg.size()).toBe(1);
  });

  it('cancelAll then clear empties map (close semantics)', async () => {
    const reg = new ActiveGenerationRegistry();
    const cancels = Array.from({ length: 5 }, () => vi.fn(() => Promise.resolve()));
    for (let i = 0; i < cancels.length; i += 1) {
      reg.register({
        correlationId: `c-${i}`,
        accountId: `acc-${i}`,
        startedAt: i,
        cancel: cancels[i],
      });
    }
    await reg.cancelAll();
    for (const c of cancels) expect(c).toHaveBeenCalledOnce();
    // cancelAll does not unregister — finally of each request does
    expect(reg.size()).toBe(5);
    reg.clear();
    expect(reg.isEmpty()).toBe(true);
  });

  it('stress: many accounts concurrent register / cancel / unregister', async () => {
    const reg = new ActiveGenerationRegistry();
    const N = 40;
    const ids = Array.from({ length: N }, (_, i) => ({
      corr: `corr-${i}`,
      account: `acc-${i % 8}`, // 8 workers
      cancel: vi.fn(() => Promise.resolve()),
    }));

    for (const row of ids) {
      reg.register({
        correlationId: row.corr,
        accountId: row.account,
        startedAt: Date.now(),
        cancel: row.cancel,
      });
    }
    expect(reg.size()).toBe(N);

    // Cancel even indices
    for (let i = 0; i < N; i += 2) {
      await reg.cancel(ids[i].corr);
      reg.unregister(ids[i].corr);
    }
    expect(reg.size()).toBe(N / 2);

    // Odd handles still live
    for (let i = 1; i < N; i += 2) {
      expect(reg.get(ids[i].corr)).toBeTruthy();
      expect(ids[i].cancel).not.toHaveBeenCalled();
    }

    // Complete odds
    for (let i = 1; i < N; i += 2) {
      reg.unregister(ids[i].corr);
    }
    expect(reg.isEmpty()).toBe(true);
  });

  it('same account can hold multiple correlations in index', () => {
    const reg = new ActiveGenerationRegistry();
    const accountId = 'acc-shared';
    reg.register({
      correlationId: 'c1',
      accountId,
      startedAt: 1,
      cancel: () => Promise.resolve(),
    });
    reg.register({
      correlationId: 'c2',
      accountId,
      startedAt: 2,
      cancel: () => Promise.resolve(),
    });
    expect(reg.listByAccount(accountId).sort()).toEqual(['c1', 'c2']);
    reg.unregister('c1');
    expect(reg.listByAccount(accountId)).toEqual(['c2']);
    reg.unregister('c2');
    expect(reg.listByAccount(accountId)).toEqual([]);
  });
});

describe('PlaywrightGeminiAdapter activeIds map', () => {
  it('cancelRequest uses mapped correlation before send completes', async () => {
    const cancelActive = vi.fn(() => Promise.resolve(true));
    const geminiService = {
      cancelActive,
      close: vi.fn(() => Promise.resolve()),
      sendTranslation: vi.fn(),
    };
    const { PlaywrightGeminiAdapter } = await import(
      '@main/ai/adapters/playwright-gemini-adapter'
    );
    const adapter = new PlaywrightGeminiAdapter(geminiService as never);

    // Simulate mid-flight map (sendPrompt sets this before await)
    const requestId = newId();
    (adapter as unknown as { activeIds: Map<string, string> }).activeIds.set(
      requestId,
      requestId,
    );

    await adapter.cancelRequest(requestId);
    expect(cancelActive).toHaveBeenCalledWith(requestId);
    expect(
      (adapter as unknown as { activeIds: Map<string, string> }).activeIds.has(requestId),
    ).toBe(false);
  });
});
