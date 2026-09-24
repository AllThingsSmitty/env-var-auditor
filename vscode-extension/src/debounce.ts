// Plain TypeScript, no `vscode` import — kept unit-testable with fake timers.

/**
 * A single-slot debouncer: each `trigger()` call replaces any pending timer.
 * Used for the short (~50ms) "flatten -> analyze -> publish" coalescing step
 * so that a burst of file events runs the pipeline once, not once per file.
 */
export interface Debouncer {
  trigger(fn: () => void): void;
  cancel(): void;
}

export function createDebouncer(waitMs: number): Debouncer {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    trigger(fn: () => void): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, waitMs);
    },
    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/**
 * A debouncer keyed by an arbitrary key (e.g. a document URI string), so
 * edits to different files each get their own independent debounce window.
 * The callback passed to `trigger()` is the one that ends up running for
 * that invocation — later `trigger()` calls for the same key replace both
 * the timer and the pending callback.
 */
export interface KeyedDebouncer<K> {
  trigger(key: K, fn: () => void): void;
  cancel(key: K): void;
  cancelAll(): void;
  size(): number;
}

export function createKeyedDebouncer<K>(waitMs: number): KeyedDebouncer<K> {
  const timers = new Map<K, ReturnType<typeof setTimeout>>();

  return {
    trigger(key: K, fn: () => void): void {
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.delete(key);
        fn();
      }, waitMs);
      timers.set(key, timer);
    },
    cancel(key: K): void {
      const existing = timers.get(key);
      if (existing) {
        clearTimeout(existing);
        timers.delete(key);
      }
    },
    cancelAll(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
    size(): number {
      return timers.size;
    },
  };
}
