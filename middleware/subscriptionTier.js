// backend/middleware/subscriptionTier.js
/**
 * Middleware to restrict access to users with a minimum subscription tier.
 * Usage: app.use('/hero-only', requireSubscriptionTier(2))
 */
import pool from '../database.js';

export function requireSubscriptionTier(minTierId) {
  return async function (req, res, next) {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const [rows] = await pool.query(
      'SELECT subscription_tier_id FROM users WHERE id = UUID_TO_BIN(?)',
      [userId]
    );
    const tier = rows[0]?.subscription_tier_id || 0;
    if (tier < minTierId) {
      return res.status(403).json({ success: false, message: 'This feature is restricted to higher subscription tiers.' });
    }
    next();
  };
}
