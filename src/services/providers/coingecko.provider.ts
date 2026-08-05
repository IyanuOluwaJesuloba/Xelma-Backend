import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { toDecimal } from '../../utils/decimal.util';
import { AssetPriceSet, PriceProvider } from '../price-provider.interface';

const DEFAULT_MULTI_ASSET_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,stellar&vs_currencies=usd';

export class CoinGeckoProvider implements PriceProvider {
  readonly name = 'coingecko';

  constructor(private readonly url: string, private readonly timeoutMs: number) {}

  async fetchPrice(): Promise<Decimal> {
    const response = await axios.get(this.url, { timeout: this.timeoutMs });
    const rawPrice = response.data?.stellar?.usd;
    if (rawPrice === undefined || rawPrice === null) {
      throw new Error('Invalid response from CoinGecko: missing stellar.usd');
    }
    return toDecimal(rawPrice as string | number);
  }

  async fetchAssetPrices(): Promise<AssetPriceSet> {
    const multiAssetUrl = process.env.COINGECKO_MULTI_PRICE_URL ?? DEFAULT_MULTI_ASSET_URL;
    const response = await axios.get(multiAssetUrl, { timeout: this.timeoutMs });
    const data = response.data as Record<string, { usd?: number | string }> | undefined;

    const btc = data?.bitcoin?.usd;
    const eth = data?.ethereum?.usd;
    const xlm = data?.stellar?.usd;

    if (btc === undefined || btc === null || eth === undefined || eth === null || xlm === undefined || xlm === null) {
      throw new Error('Invalid response from CoinGecko: missing BTC, ETH, or XLM price');
    }

    return { BTC: toDecimal(btc), ETH: toDecimal(eth), XLM: toDecimal(xlm) };
  }
}
