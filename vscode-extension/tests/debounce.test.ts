import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDebouncer, createKeyedDebouncer } from '../src/debounce.js';

describe('createDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire before the wait elapses', () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(100);
    debouncer.trigger(fn);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
  });

  it('fires once after the wait elapses', () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(100);
    debouncer.trigger(fn);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid successive triggers into a single call using the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const debouncer = createDebouncer(100);
    debouncer.trigger(first);
    vi.advanceTimersByTime(50);
    debouncer.trigger(second);
    vi.advanceTimersByTime(100);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancel() prevents a pending trigger from firing', () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(100);
    debouncer.trigger(fn);
    debouncer.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('createKeyedDebouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces independently per key', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    const debouncer = createKeyedDebouncer<string>(100);

    debouncer.trigger('a', fnA);
    vi.advanceTimersByTime(50);
    debouncer.trigger('b', fnB);
    vi.advanceTimersByTime(50);

    // a's 100ms window has elapsed, b's has not
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('replaces the pending callback for the same key', () => {
    const first = vi.fn();
    const second = vi.fn();
    const debouncer = createKeyedDebouncer<string>(100);

    debouncer.trigger('key', first);
    debouncer.trigger('key', second);
    vi.advanceTimersByTime(100);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancel(key) only cancels that key', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    const debouncer = createKeyedDebouncer<string>(100);

    debouncer.trigger('a', fnA);
    debouncer.trigger('b', fnB);
    debouncer.cancel('a');
    vi.advanceTimersByTime(100);

    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  it('cancelAll() cancels every pending key and clears size()', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    const debouncer = createKeyedDebouncer<string>(100);

    debouncer.trigger('a', fnA);
    debouncer.trigger('b', fnB);
    expect(debouncer.size()).toBe(2);

    debouncer.cancelAll();
    expect(debouncer.size()).toBe(0);

    vi.advanceTimersByTime(100);
    expect(fnA).not.toHaveBeenCalled();
    expect(fnB).not.toHaveBeenCalled();
  });
});
