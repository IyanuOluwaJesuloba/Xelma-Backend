import type { Round as SorobanRound } from "@tevalabs/xelma-bindings";
import { RoundMode } from "@tevalabs/xelma-bindings";

const PRICE_SCALE = 10_000;
const STROOP_SCALE = 10_000_000;

export type ActiveRoundSource = "soroban" | "database" | "mock" | "none";

export interface MappedActiveRound {
  id: string;
  sorobanRoundId: string;
  mode: "UP_DOWN" | "LEGENDS";
  status: "ACTIVE";
  startPrice: number;
  poolUp: number;
  poolDown: number;
  startLedger: number;
  betEndLedger: number;
  endLedger: number;
  isSoroban: true;
  source: "soroban";
}

export interface FrontendRoundCard {
  id: string;
  asset: string;
  mode: string;
  status: string;
  startPrice: number;
  poolUp: number;
  poolDown: number;
  totalPool: number;
  predictionCount: number;
  closesAt: string;
  source: "live" | "mock";
  roundStatus: string;
  roundTiming: {
    startsAt: string;
    endsAt: string;
  };
  priceData: {
    startPrice: number;
    currentPrice: number;
    change24h?: number;
  };
  poolValues: {
    upPool: number;
    downPool: number;
    totalPool: number;
  };
  predictionMetadata: {
    predictionCount: number;
    canPredict: boolean;
    roundId?: string;
    sorobanRoundId?: string;
  };
  [key: string]: unknown;
}

function toNumber(value: bigint | number | string | undefined | null): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

export function mapSorobanActiveRound(round: SorobanRound): MappedActiveRound {
  const roundId = toNumber(round.round_id);
  const mode =
    (round.mode as any) === RoundMode.Precision || (round.mode as any) === 1 ? "LEGENDS" : "UP_DOWN";

  return {
    id: `soroban-${roundId}`,
    sorobanRoundId: String(roundId),
    mode,
    status: "ACTIVE",
    startPrice: toNumber(round.price_start) / PRICE_SCALE,
    poolUp: toNumber(round.pool_up) / STROOP_SCALE,
    poolDown: toNumber(round.pool_down) / STROOP_SCALE,
    startLedger: Number(round.start_ledger),
    betEndLedger: Number(round.bet_end_ledger),
    endLedger: Number(round.end_ledger),
    isSoroban: true,
    source: "soroban",
  };
}

export function mapDatabaseActiveRound(round: Record<string, unknown>): Record<string, unknown> {
  return {
    ...round,
    source: "database" as const,
  };
}

export function mapMockActiveRound(round: Record<string, unknown>): Record<string, unknown> {
  return {
    ...round,
    source: "mock" as const,
  };
}

const MOCK_ASSETS = [
  { asset: "BTC", symbol: "BTC", label: "Bitcoin" },
  { asset: "ETH", symbol: "ETH", label: "Ethereum" },
  { asset: "XLM", symbol: "XLM", label: "Stellar" },
] as const;

function buildMockFrontendCard(asset: string, index: number): FrontendRoundCard {
  const startPrice = asset === "BTC" ? 60000 : asset === "ETH" ? 3000 : 0.12;
  const currentPrice = asset === "BTC" ? 61000 : asset === "ETH" ? 3050 : 0.13;
  const upPool = asset === "BTC" ? 1800 : asset === "ETH" ? 1200 : 250;
  const downPool = asset === "BTC" ? 1400 : asset === "ETH" ? 950 : 150;
  const totalPool = upPool + downPool;

  return {
    id: `${asset.toLowerCase()}-round-${index + 1}`,
    asset,
    mode: "updown",
    status: "live",
    startPrice,
    poolUp: upPool,
    poolDown: downPool,
    totalPool,
    predictionCount: asset === "BTC" ? 4 : asset === "ETH" ? 7 : 2,
    closesAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    source: "mock",
    roundStatus: "ACTIVE",
    roundTiming: {
      startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    priceData: {
      startPrice,
      currentPrice,
    },
    poolValues: {
      upPool,
      downPool,
      totalPool,
    },
    predictionMetadata: {
      predictionCount: asset === "BTC" ? 4 : asset === "ETH" ? 7 : 2,
      canPredict: true,
    },
  };
}

function buildLiveFrontendCard(round: SorobanRound | null): FrontendRoundCard | null {
  if (!round) return null;

  const mappedRound = mapSorobanActiveRound(round);
  const startPrice = mappedRound.startPrice;
  const currentPrice = startPrice * 1.01;
  const upPool = mappedRound.poolUp;
  const downPool = mappedRound.poolDown;
  const totalPool = upPool + downPool;

  return {
    id: mappedRound.id,
    asset: "XLM",
    mode: mappedRound.mode === "LEGENDS" ? "precision" : "updown",
    status: "live",
    startPrice,
    poolUp: upPool,
    poolDown: downPool,
    totalPool,
    predictionCount: 1,
    closesAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    source: "live",
    roundStatus: mappedRound.status,
    roundTiming: {
      startsAt: new Date(Date.now() - 2 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    },
    priceData: {
      startPrice,
      currentPrice,
    },
    poolValues: {
      upPool,
      downPool,
      totalPool,
    },
    predictionMetadata: {
      predictionCount: 1,
      canPredict: true,
      roundId: mappedRound.id,
      sorobanRoundId: mappedRound.sorobanRoundId,
    },
    sorobanRoundId: mappedRound.sorobanRoundId,
    isSoroban: mappedRound.isSoroban,
  };
}

export function mapSorobanRoundToFrontendCards(round: SorobanRound | null): FrontendRoundCard[] {
  const cards: FrontendRoundCard[] = [];
  const liveCard = buildLiveFrontendCard(round);

  if (liveCard) {
    cards.push(liveCard);
  }

  const mockAssets = MOCK_ASSETS.filter(({ asset }) => asset !== "XLM");
  const mockCards = mockAssets.map((asset, index) => buildMockFrontendCard(asset.asset, index));

  if (liveCard) {
    cards.push(...mockCards);
  } else {
    cards.push(...MOCK_ASSETS.map((asset, index) => buildMockFrontendCard(asset.asset, index)));
  }

  return cards;
}
