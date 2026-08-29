import { describe, expect, it } from 'vitest';
import { nextSequentialDisplayName } from '../../../src/shared/utils/account-display-name';

describe('nextSequentialDisplayName', () => {
  it('increments from existing count', () => {
    expect(nextSequentialDisplayName('ChatGPT', 0)).toBe('ChatGPT 1');
    expect(nextSequentialDisplayName('ChatGPT', 2)).toBe('ChatGPT 3');
    expect(nextSequentialDisplayName('Tài khoản Google', 4)).toBe('Tài khoản Google 5');
  });
});
