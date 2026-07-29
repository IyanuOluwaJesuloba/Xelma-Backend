import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { db } from '../db/db';
import { hackathonUsers, hackathonRounds, hackathonBets } from '../db/schema';
import { eq } from 'drizzle-orm';
import hackathonService from '../services/hackathon.service';

jest.mock('../services/stellar.service', () => ({
  isValidStellarAddress: () => true,
  verifySignature: jest.fn(),
}));

jest.mock('../services/soroban.service', () => ({
  getUserStats: jest.fn(),
  getPendingWinnings: jest.fn(),
  getHealth: jest.fn(),
}));

const TEST_ADDRESS = 'GAAAAATOMIC_BET_TEST_ADDR_000000000000000001';

describe('Hackathon Atomic Bets', () => {
  beforeAll(async () => {
    await db.delete(hackathonBets).where(eq(hackathonBets.address, TEST_ADDRESS));
    await db.delete(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS));
    await db.insert(hackathonUsers).values({
      address: TEST_ADDRESS,
      balance: 5000,
      pendingWinnings: 0,
      totalWins: 3,
      totalLosses: 1,
      currentStreak: 3,
      xp: 410,
      rankTitle: 'Rookie',
    });
  });

  afterAll(async () => {
    await db.delete(hackathonBets).where(eq(hackathonBets.address, TEST_ADDRESS));
    await db.delete(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS));
    const { pool } = require('../db/db');
    await pool.end();
  });

  describe('happy path', () => {
    it('atomically inserts bet, deducts balance, and updates pool for UP/DOWN mode', async () => {
      const roundBefore = (await db.select().from(hackathonRounds).where(eq(hackathonRounds.id, 'btc-updown-live')))[0];
      const userBefore = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];

      await hackathonService.placeBet('btc-updown-live', TEST_ADDRESS, 200, 'UP');

      const roundAfter = (await db.select().from(hackathonRounds).where(eq(hackathonRounds.id, 'btc-updown-live')))[0];
      const userAfter = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const bets = await db.select().from(hackathonBets)
        .where(eq(hackathonBets.address, TEST_ADDRESS));

      const freshBet = bets.find(b => b.roundId === 'btc-updown-live');
      expect(freshBet).toBeDefined();
      expect(freshBet!.amount).toBe(200);
      expect(freshBet!.side).toBe('UP');
      expect(userAfter.balance).toBe(userBefore.balance - 200);
      expect(roundAfter.poolUp).toBe(roundBefore.poolUp + 200);
    });

    it('atomically inserts bet and updates totalPool for Precision mode', async () => {
      const roundBefore = (await db.select().from(hackathonRounds).where(eq(hackathonRounds.id, 'eth-precision-live')))[0];
      const userBefore = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];

      await hackathonService.placeBet('eth-precision-live', TEST_ADDRESS, 150, undefined, 3250);

      const roundAfter = (await db.select().from(hackathonRounds).where(eq(hackathonRounds.id, 'eth-precision-live')))[0];
      const userAfter = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const bets = await db.select().from(hackathonBets)
        .where(eq(hackathonBets.address, TEST_ADDRESS));

      const freshBet = bets.find(b => b.roundId === 'eth-precision-live');
      expect(freshBet).toBeDefined();
      expect(freshBet!.amount).toBe(150);
      expect(freshBet!.predictedPrice).toBe(3250);
      expect(userAfter.balance).toBe(userBefore.balance - 150);
      expect(roundAfter.totalPool).toBe(roundBefore.totalPool + 150);
      expect(roundAfter.predictionCount).toBe(roundBefore.predictionCount + 1);
    });
  });

  describe('rollback on failure', () => {
    it('rolls back all changes when FK constraint is violated (non-existent round)', async () => {
      const userBefore = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const roundsBefore = await db.select().from(hackathonRounds);

      await expect(
        hackathonService.placeBet('nonexistent-round-id', TEST_ADDRESS, 100, 'UP')
      ).rejects.toThrow();

      const userAfter = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const roundsAfter = await db.select().from(hackathonRounds);
      const bet = await db.select().from(hackathonBets)
        .where(eq(hackathonBets.address, TEST_ADDRESS))
        .where(eq(hackathonBets.roundId, 'nonexistent-round-id'));

      expect(bet.length).toBe(0);
      expect(userAfter.balance).toBe(userBefore.balance);
      expect(roundsAfter).toEqual(roundsBefore);
    });

    it('rolls back all changes when transaction throws', async () => {
      const userBefore = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const roundsBefore = await db.select().from(hackathonRounds);

      const txSpy = jest.spyOn(db, 'transaction').mockRejectedValue(new Error('Simulated transaction failure'));

      await expect(
        hackathonService.placeBet('btc-updown-live', TEST_ADDRESS, 100, 'UP')
      ).rejects.toThrow('Simulated transaction failure');

      const userAfter = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const roundsAfter = await db.select().from(hackathonRounds);
      const bets = await db.select().from(hackathonBets)
        .where(eq(hackathonBets.address, TEST_ADDRESS))
        .where(eq(hackathonBets.roundId, 'btc-updown-live'));

      expect(bets.length).toBe(0);
      expect(userAfter.balance).toBe(userBefore.balance);
      expect(roundsAfter).toEqual(roundsBefore);

      txSpy.mockRestore();
    });
  });

  describe('concurrent bets', () => {
    it('handles concurrent bet placement without data corruption', async () => {
      const roundId = 'btc-updown-live';
      const roundBefore = (await db.select().from(hackathonRounds).where(eq(hackathonRounds.id, roundId)))[0];
      const userBefore = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];

      const promises = [
        hackathonService.placeBet(roundId, TEST_ADDRESS, 100, 'UP'),
        hackathonService.placeBet(roundId, TEST_ADDRESS, 200, 'DOWN'),
        hackathonService.placeBet(roundId, TEST_ADDRESS, 50, 'UP'),
      ];

      await expect(Promise.all(promises)).resolves.toEqual([undefined, undefined, undefined]);

      const userAfter = (await db.select().from(hackathonUsers).where(eq(hackathonUsers.address, TEST_ADDRESS)))[0];
      const roundAfter = (await db.select().from(hackathonRounds).where(eq(hackathonRounds.id, roundId)))[0];
      const bets = await db.select().from(hackathonBets)
        .where(eq(hackathonBets.address, TEST_ADDRESS));

      const roundBets = bets.filter(b => b.roundId === roundId);
      expect(roundBets.length).toBe(3);

      const totalBetAmount = roundBets.reduce((sum, b) => sum + b.amount, 0);
      expect(userAfter.balance).toBe(userBefore.balance - totalBetAmount);
      expect(roundAfter.poolUp).toBe(roundBefore.poolUp + 100 + 50);
      expect(roundAfter.poolDown).toBe(roundBefore.poolDown + 200);
    });
  });
});
