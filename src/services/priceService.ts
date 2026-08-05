import { mockData } from '../data/mockData';
import config from '../config';
import logger from '../utils/logger';
import { toNumber } from '../utils/decimal.util';
import { AssetPriceSet, PriceProvider } from './price-provider.interface';
import { createDefaultProviders } from './providers';

const CACHE_TTL_MS = 30_000;

export interface PriceResponse {
  BTC: number;
  ETH: number;
  XLM: number;
  stale: boolean;
  lastUpdatedAt: string | null;
}

interface CacheEntry {
  data: PriceResponse;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
let providers: PriceProvider[] | null = null;

/** Lazily built so config/env overrides are picked up at first use, not import time. */
function getProviders(): PriceProvider[] {
  if (!providers) {
    providers = createDefaultProviders();
  }
  return providers;
}

function getMockPrices(): PriceResponse {
  const btc = mockData.prices.find((p) => p.symbol === 'btc')?.price ?? 60_000;
  const eth = mockData.prices.find((p) => p.symbol === 'eth')?.price ?? 3_000;

  return {
    BTC: btc,
    ETH: eth,
    XLM: 0.2891,
    stale: false,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function toPriceResponse(assetPrices: AssetPriceSet): PriceResponse {
  return {
    BTC: toNumber(assetPrices.BTC),
    ETH: toNumber(assetPrices.ETH),
    XLM: toNumber(assetPrices.XLM),
    stale: false,
    lastUpdatedAt: new Date().toISOString(),
  };
}

function withStaleFlag(data: PriceResponse): PriceResponse {
  return { ...data, stale: true };
}

/**
 * Fetch BTC/ETH/XLM using the same provider chain and failover order as the
 * settlement oracle (CoinGecko primary, CoinCap fallback), so both surfaces
 * share one Decimal-safe provider stack.
 */
async function fetchAssetPricesWithFailover(): Promise<AssetPriceSet> {
  let lastError: unknown;

  for (const provider of getProviders()) {
    try {
      return await provider.fetchAssetPrices();
    } catch (err) {
      lastError = err;
      logger.warn(`Multi-asset price fetch failed for provider ${provider.name}, trying next`, {
        provider: provider.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All configured price providers failed');
}

/** Reset in-memory cache (for tests). */
export function resetPriceCache(): void {
  cache = null;
}

export const getPrices = async (): Promise<PriceResponse> => {
  if (config.app.dataMode === 'mock') {
    return getMockPrices();
  }

  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const assetPrices = await fetchAssetPricesWithFailover();
    const fresh = toPriceResponse(assetPrices);
    cache = { data: fresh, fetchedAt: now };
    return fresh;
  } catch (err) {
    logger.warn('All multi-asset price providers failed', {
      error: err instanceof Error ? err.message : String(err),
      hasCache: Boolean(cache),
    });

    if (cache) {
      return withStaleFlag(cache.data);
    }

    logger.warn('No cache available — returning static fallback prices');
    return {
      BTC: 60_000,
      ETH: 3_000,
      XLM: 0.2891,
      stale: true,
      lastUpdatedAt: null,
    };
  }
};
