import { RoundMode } from "@tevalabs/xelma-bindings";

/** Shape of a live Soroban active round response (as returned by get_active_round). */
export interface FixtureSorobanRound {
  round_id: bigint;
  mode: RoundMode;
  price_start: bigint;
  pool_up: bigint;
  pool_down: bigint;
  start_ledger: number;
  bet_end_ledger: number;
  end_ledger: number;
}

/** Shape of user stats (as returned by get_user_stats). */
export interface FixtureUserStats {
  total_wins: number;
  total_losses: number;
  best_streak: number;
  current_streak: number;
}

/**
 * Creates a fixture UP/DOWN active round.
 * Default values represent a typical live round (price ~1.2345 XLM).
 */
export function createActiveUpDownRound(
  overrides?: Partial<FixtureSorobanRound>,
): FixtureSorobanRound {
  return {
    round_id: BigInt(42),
    mode: RoundMode.UpDown,
    price_start: BigInt(12345),        // scaled 4 decimals → $1.2345
    pool_up: BigInt(50_000_000_0),      // 5 XLM in stroops * 10 = 5
    pool_down: BigInt(25_000_000_0),    // 2.5 XLM
    start_ledger: 1000,
    bet_end_ledger: 1100,
    end_ledger: 1200,
    ...overrides,
  };
}

/**
 * Creates a fixture LEGENDS (Precision) active round.
 * Default values represent a round with price ranges.
 */
export function createActiveLegendsRound(
  overrides?: Partial<FixtureSorobanRound>,
): FixtureSorobanRound {
  return {
    round_id: BigInt(7),
    mode: RoundMode.Precision,
    price_start: BigInt(10000),         // $1.0000
    pool_up: BigInt(0),
    pool_down: BigInt(0),
    start_ledger: 1,
    bet_end_ledger: 2,
    end_ledger: 3,
    ...overrides,
  };
}

/**
 * Creates a fixture UserStats response.
 */
export function createFixtureUserStats(
  overrides?: Partial<FixtureUserStats>,
): FixtureUserStats {
  return {
    total_wins: 10,
    total_losses: 5,
    best_streak: 4,
    current_streak: 2,
    ...overrides,
  };
}

/**
 * Helper: builds a mock AssembledTransaction-shaped object.
 * Soroban service methods use `tx.result` to get the simulation result.
 */
export function mockTx<T>(result: T): Promise<{ result: T; signAndSend: (opts?: unknown) => Promise<{ result: T }> }> {
  return Promise.resolve({
    result,
    signAndSend: async (_opts?: unknown) => ({ result }),
  });
}
