import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { prisma } from '../lib/prisma';
import {
   acquireIdempotencyLock,
   IDEMPOTENCY_STORE_UNAVAILABLE,
   IdempotencyStoreUnavailableError,
   releaseIdempotencyLock,
   storeIdempotencyResult,
} from '../utils/idempotency.util';

jest.mock('../lib/prisma', () => ({
   prisma: {
      idempotencyKey: {
         create: jest.fn(),
         delete: jest.fn(),
         deleteMany: jest.fn(),
         findUnique: jest.fn(),
         upsert: jest.fn(),
      },
   },
}));

const idempotencyKeyModel = (prisma as any).idempotencyKey as Record<
   string,
   jest.Mock
>;

describe('money-route idempotency failure handling', () => {
   const originalEnv = process.env;

   beforeEach(() => {
      process.env = { ...originalEnv };
      jest.clearAllMocks();
   });

   afterEach(() => {
      process.env = originalEnv;
   });

   it('returns store-unavailable instead of allowing a database-backed bet through', async () => {
      process.env.DATA_STORE = 'postgres';
      process.env.BET_STUB_MODE = 'false';
      idempotencyKeyModel.findUnique.mockRejectedValueOnce(new Error('database down'));

      await expect(
         acquireIdempotencyLock(
            'user-1',
            '/api/bets/up-down',
            'db-outage-key',
            { amount: 10, side: 'UP' },
         ),
      ).resolves.toEqual({
         isIdempotent: true,
         error: IDEMPOTENCY_STORE_UNAVAILABLE,
      });
      expect(idempotencyKeyModel.create).not.toHaveBeenCalled();
   });

   it('uses an in-memory lock for stub or memory-backed modes', async () => {
      process.env.DATA_STORE = 'memory';
      process.env.BET_STUB_MODE = 'true';

      const lock = await acquireIdempotencyLock(
         'user-1',
         '/api/bets/up-down',
         'memory-key',
         { amount: 10, side: 'UP' },
      );
      expect(lock).toEqual({ isIdempotent: false, lockAcquired: true });
      expect(idempotencyKeyModel.create).not.toHaveBeenCalled();

      await storeIdempotencyResult(
         'user-1',
         '/api/bets/up-down',
         'memory-key',
         { amount: 10, side: 'UP' },
         200,
         { success: true },
      );

      const duplicate = await acquireIdempotencyLock(
         'user-1',
         '/api/bets/up-down',
         'memory-key',
         { amount: 10, side: 'UP' },
      );
      expect(duplicate.cachedResponse).toEqual({
         status: 200,
         body: { success: true },
      });

      await releaseIdempotencyLock('user-1', '/api/bets/up-down', 'memory-key');
   });

   it('surfaces a database write failure instead of releasing a completed-operation lock', async () => {
      process.env.DATA_STORE = 'postgres';
      process.env.BET_STUB_MODE = 'false';
      idempotencyKeyModel.findUnique.mockResolvedValueOnce(null);
      idempotencyKeyModel.create.mockResolvedValueOnce({});

      const lock = await acquireIdempotencyLock(
         'user-1',
         '/api/bets/up-down',
         'write-outage-key',
         { amount: 10, side: 'UP' },
      );
      expect(lock.lockAcquired).toBe(true);

      idempotencyKeyModel.upsert.mockRejectedValueOnce(new Error('database down'));
      await expect(
         storeIdempotencyResult(
            'user-1',
            '/api/bets/up-down',
            'write-outage-key',
            { amount: 10, side: 'UP' },
            200,
            { success: true },
         ),
      ).rejects.toBeInstanceOf(IdempotencyStoreUnavailableError);
   });
});
