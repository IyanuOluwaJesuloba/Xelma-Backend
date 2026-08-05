import { describe, it, expect } from '@jest/globals';
import { withTimeout, timeoutPromise, createTimeoutSignal } from '../utils/timeout-wrapper';

describe('timeout-wrapper', () => {
  describe('withTimeout', () => {
    it('returns success with data when the operation resolves in time', async () => {
      const result = await withTimeout(() => Promise.resolve('ok'), {
        timeoutMs: 200,
        operationName: 'quick-op',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('ok');
      expect(result.timedOut).toBe(false);
    });

    it('reports timedOut when the operation exceeds timeoutMs', async () => {
      const neverResolves = () => new Promise<never>(() => {});

      const result = await withTimeout(neverResolves, {
        timeoutMs: 20,
        operationName: 'slow-op',
        retries: 1,
      });

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error?.message).toMatch(/timeout/);
    });

    it('retries on failure and succeeds once the operation stops failing', async () => {
      let attempts = 0;
      const flaky = () => {
        attempts += 1;
        if (attempts < 2) return Promise.reject(new Error('temporary failure'));
        return Promise.resolve('recovered');
      };

      const result = await withTimeout(flaky, {
        timeoutMs: 200,
        operationName: 'flaky-op',
        retries: 3,
        backoffMultiplier: 1,
        maxBackoffMs: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
      expect(attempts).toBe(2);
    });

    it('returns failure with the last error after exhausting all retries', async () => {
      const alwaysFails = () => Promise.reject(new Error('permanent failure'));

      const result = await withTimeout(alwaysFails, {
        timeoutMs: 200,
        operationName: 'failing-op',
        retries: 2,
        backoffMultiplier: 1,
        maxBackoffMs: 5,
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('permanent failure');
      expect(result.retriesUsed).toBe(2);
    });
  });

  describe('timeoutPromise', () => {
    it('resolves with the underlying value when it settles in time', async () => {
      await expect(timeoutPromise(Promise.resolve('value'), 200)).resolves.toBe('value');
    });

    it('rejects with a timeout error when the promise never settles', async () => {
      const neverResolves = new Promise<never>(() => {});
      await expect(timeoutPromise(neverResolves, 20)).rejects.toThrow(/timeout/);
    });
  });

  describe('createTimeoutSignal', () => {
    it('returns a signal that is not yet aborted', () => {
      const signal = createTimeoutSignal(200);
      expect(signal.aborted).toBe(false);
    });

    it('aborts the signal after the timeout elapses', async () => {
      const signal = createTimeoutSignal(20);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(signal.aborted).toBe(true);
    });
  });
});
