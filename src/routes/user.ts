import { Router, Request, Response, NextFunction } from 'express';
import { validateStellarAddressParam } from '../utils/stellar-address.util';
import hackathonService from '../services/hackathon.service';

const router = Router();

/**
 * @openapi
 * /api/user/{address}/stats:
 *   get:
 *     summary: Return per-wallet stats for a Stellar address
 *     tags:
 *       - user
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet-specific stats
 *       400:
 *         description: Invalid wallet address
 */
router.get('/:address/stats', validateStellarAddressParam('address'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address } = req.params;

    // TODO: Wire to contract get_user_stats() and get_pending_winnings()
    const stats = await hackathonService.getUserStats(address);

    return res.json({
      address: stats.address,
      balance: stats.balance,
      pendingWinnings: stats.pendingWinnings,
      totalWins: stats.totalWins,
      totalLosses: stats.totalLosses,
      currentStreak: stats.currentStreak,
      xp: stats.xp,
      rankTitle: stats.rankTitle,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
