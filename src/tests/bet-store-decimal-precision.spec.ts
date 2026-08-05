import { describe, it, expect } from '@jest/globals';
import { betStore } from '../data/bet-store';

describe('bet-store Decimal-safe pool math', () => {
  it('accumulates fractional UP bets without native float drift', () => {
    // Ten additions of 0.1 drift to 2800.9999999999998 under native JS
    // floating point; Decimal-backed arithmetic must land on exactly 2801.
    for (let i = 0; i < 10; i++) {
      betStore.addUpDownBet('btc-updown-live', `addr-up-${i}`, 0.1, 'UP');
    }

    const round = betStore.getRounds().find((r) => r.id === 'btc-updown-live')!;
    expect(round.poolUp).toBe(2801);
  });

  it('keeps totalPool consistent with poolUp + poolDown after a fractional DOWN bet', () => {
    betStore.addUpDownBet('xlm-updown-new', 'addr-down', 0.3, 'DOWN');

    const round = betStore.getRounds().find((r) => r.id === 'xlm-updown-new')!;
    expect(round.poolDown).toBe(0.3);
    expect(round.totalPool).toBe(round.poolUp + round.poolDown);
    expect(round.totalPool).toBe(200.3);
  });

  it('accumulates fractional precision bets without float drift', () => {
    for (let i = 0; i < 3; i++) {
      betStore.addPrecisionBet('eth-precision-live', `addr-precision-${i}`, 0.1, 3250 + i);
    }

    const round = betStore.getRounds().find((r) => r.id === 'eth-precision-live')!;
    // Seed totalPool is 1800; three 0.1 bets must land on exactly 1800.3.
    expect(round.totalPool).toBe(1800.3);
    expect(round.predictionCount).toBe(25);
  });
});
