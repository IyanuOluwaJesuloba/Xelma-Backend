import { Decimal } from '@prisma/client/runtime/library';
import { decAdd, decDiv, decMul, toDecimal } from './decimal.util';

/** 1 XLM = 10^7 stroops (Soroban / Stellar native unit). */
export const STROOPS_PER_XLM = 10_000_000;

/**
 * Calculates the payout for a correct prediction: stake + (stake / winningPool) * losingPool
 */
export function calculatePayout(
  stake: Decimal,
  winningPool: Decimal,
  losingPool: Decimal,
): Decimal {
  if (winningPool.isZero()) {
    return stake;
  }
  // stake + (stake / winningPool) * losingPool
  const shareOfLosingPool = decMul(decDiv(stake, winningPool), losingPool);
  return decAdd(stake, shareOfLosingPool);
}

/** Converts stroops (contract i128) to XLM as a JS number. */
export function stroopsToXlm(stroops: bigint | number | string): number {
  return Number(stroops) / STROOPS_PER_XLM;
}

/** Converts an XLM amount to stroops for contract calls. */
export function xlmToStroops(amount: number | string | Decimal): bigint {
  return BigInt(toDecimal(amount).mul(STROOPS_PER_XLM).toFixed(0));
}
