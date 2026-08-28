/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { assertOverlayVisible } from '../../../../src/renderer/components/overlay/overlay-visibility';

describe('assertOverlayVisible', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns visible for sized element in viewport', () => {
    const el = document.createElement('div');
    el.style.width = '100px';
    el.style.height = '40px';
    document.body.appendChild(el);
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        top: 10,
        left: 10,
        bottom: 50,
        right: 110,
        width: 100,
        height: 40,
        x: 10,
        y: 10,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(el, 'offsetWidth', { value: 100 });
    Object.defineProperty(el, 'offsetHeight', { value: 40 });

    const result = assertOverlayVisible(el, { viewport: { width: 1366, height: 768 } });
    expect(result.hasSize).toBe(true);
    expect(result.inViewport).toBe(true);
    expect(result.visible).toBe(true);
  });

  it('flags zero-size overlay', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'offsetWidth', { value: 0 });
    Object.defineProperty(el, 'offsetHeight', { value: 0 });
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    const result = assertOverlayVisible(el);
    expect(result.visible).toBe(false);
    expect(result.reasons).toContain('zero size');
  });

  it('flags element outside viewport', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    Object.defineProperty(el, 'offsetWidth', { value: 80 });
    Object.defineProperty(el, 'offsetHeight', { value: 30 });
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({
        top: 800,
        left: 10,
        bottom: 830,
        right: 90,
        width: 80,
        height: 30,
        x: 10,
        y: 800,
        toJSON: () => ({}),
      }),
    });

    const result = assertOverlayVisible(el, { viewport: { width: 1366, height: 768 } });
    expect(result.inViewport).toBe(false);
    expect(result.reasons).toContain('outside viewport');
  });
});
