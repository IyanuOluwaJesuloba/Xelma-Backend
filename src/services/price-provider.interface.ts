import { Decimal } from '@prisma/client/runtime/library';

/** BTC/ETH/XLM snapshot returned by the multi-asset price endpoint. */
export interface AssetPriceSet {
  BTC: Decimal;
  ETH: Decimal;
  XLM: Decimal;
}

export interface PriceProvider {
  readonly name: string;
  /** Single XLM/USD price, used by the settlement oracle poller. */
  fetchPrice(): Promise<Decimal>;
  /** BTC/ETH/XLM snapshot, used by the on-demand /api/prices endpoint. */
  fetchAssetPrices(): Promise<AssetPriceSet>;
}
