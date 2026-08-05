import { describe, it, expect, jest } from '@jest/globals';
import axios from 'axios';
import { Decimal } from '@prisma/client/runtime/library';
import { CoinGeckoProvider } from '../services/providers/coingecko.provider';
import { CoinCapProvider } from '../services/providers/coincap.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CoinGeckoProvider.fetchAssetPrices', () => {
  const provider = new CoinGeckoProvider('https://coingecko.example/ids=stellar', 5_000);

  it('maps BTC/ETH/XLM to Decimal with exact string precision', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        bitcoin: { usd: '67420.12345678' },
        ethereum: { usd: '3241.55' },
        stellar: { usd: '0.12345678' },
      },
    });

    const result = await provider.fetchAssetPrices();

    expect(result.BTC).toBeInstanceOf(Decimal);
    expect(result.BTC.toString()).toBe('67420.12345678');
    expect(result.ETH.toString()).toBe('3241.55');
    expect(result.XLM.toString()).toBe('0.12345678');
  });

  it('throws when a required asset price is missing', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { bitcoin: { usd: 1 }, ethereum: { usd: 2 } },
    });

    await expect(provider.fetchAssetPrices()).rejects.toThrow(/missing BTC, ETH, or XLM/);
  });
});

describe('CoinCapProvider.fetchAssetPrices', () => {
  const provider = new CoinCapProvider('https://coincap.example/assets/stellar', 5_000);

  it('maps the assets array to Decimal BTC/ETH/XLM', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          { id: 'bitcoin', priceUsd: '67000.00000001' },
          { id: 'ethereum', priceUsd: '3200.5' },
          { id: 'stellar', priceUsd: '0.28' },
        ],
      },
    });

    const result = await provider.fetchAssetPrices();

    expect(result.BTC.toString()).toBe('67000.00000001');
    expect(result.ETH.toString()).toBe('3200.5');
    expect(result.XLM.toString()).toBe('0.28');
  });

  it('throws when the assets array is missing an asset', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { data: [{ id: 'bitcoin', priceUsd: '1' }] },
    });

    await expect(provider.fetchAssetPrices()).rejects.toThrow(/missing BTC, ETH, or XLM/);
  });
});
