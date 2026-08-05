import { Router } from 'express';
import { getPrices } from '../services/priceService';
import { asyncHandler } from '../middleware/errorHandler.middleware';
import { sendSuccess } from '../utils/response';

const router = Router();

/**
 * @openapi
 * /api/prices:
 *   get:
 *     summary: Multi-asset USD prices (BTC, ETH, XLM)
 *     description: |
 *       **Hackathon/demo price endpoint. Do not confuse with production `GET /api/price`.**
 *
 *       Returns BTC, ETH, and XLM spot prices (CoinGecko with a 30-second cache,
 *       or mock data when `DATA_MODE=mock`). Wrapped in the standard
 *       `{ success: true, data }` envelope.
 *
 *       | Path | App | Purpose |
 *       |------|-----|---------|
 *       | `GET /api/prices` | Hackathon + production | Multi-asset ticker |
 *       | `GET /api/price` | Production only | Single-asset XLM oracle |
 *
 *       The hackathon app does **not** serve `/api/price`. Frontends targeting
 *       this demo API must use `/api/prices`. The two paths are **not** aliases
 *       and return different payloads on production.
 *     tags:
 *       - prices
 *     responses:
 *       200:
 *         description: Current market prices in a success envelope
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/PriceResponse'
 *       503:
 *         description: Price service unavailable (no cache)
 */
router.get(
  '/prices',
  asyncHandler(async (_req, res) => {
    const prices = await getPrices();
    sendSuccess(res, prices);
  })
);

export default router;
