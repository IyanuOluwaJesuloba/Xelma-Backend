import config from '../../config';
import { PriceProvider } from '../price-provider.interface';
import { CoinGeckoProvider } from './coingecko.provider';
import { CoinCapProvider } from './coincap.provider';

/**
 * Canonical provider chain shared by the continuously-polling XLM
 * settlement oracle and the on-demand multi-asset price endpoint, so both
 * paths fail over in the same order (CoinGecko primary, CoinCap fallback)
 * and produce Decimal-safe values.
 */
export function createDefaultProviders(
  timeoutMs: number = config.oracle.requestTimeoutMs,
): PriceProvider[] {
  return [
    new CoinGeckoProvider(config.oracle.coinGeckoUrl, timeoutMs),
    new CoinCapProvider(config.oracle.coinCapUrl, timeoutMs),
  ];
}
