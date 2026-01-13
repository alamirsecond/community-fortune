// backend/subscriptionPerksJob.js
import pool from './database.js';
import cron from 'node-cron';

// Example tier config (could be moved to DB/config file)
const TIER_CONFIG = {
  1: { name: 'Supporter', tickets: 1, siteCredit: 0 },
  2: { name: 'Hero', tickets: 5, siteCredit: 5 },
  3: { name: 'Champion', tickets: 12, siteCredit: 10 }
};

async function grantPerksForDueUsers() {
  const today = new Date().toISOString().slice(0, 10);
  const [users] = await pool.query(
    `SELECT id, subscription_tier_id, next_billing_date FROM users WHERE subscription_tier_id IS NOT NULL AND next_billing_date <= ?`,
    [today]
  );
  for (const user of users) {
    const tier = TIER_CONFIG[user.subscription_tier_id];
    if (!tier) continue;
    await pool.query(
      `UPDATE users SET universal_tickets = COALESCE(universal_tickets,0) + ?, next_billing_date = DATE_ADD(next_billing_date, INTERVAL 1 MONTH) WHERE id = ?`,
      [tier.tickets, user.id]
    );
    if (tier.siteCredit > 0) {
      // Credit site credit wallet
      await pool.query(
        `UPDATE wallets SET balance = balance + ? WHERE user_id = ? AND type = 'CREDIT'`,
        [tier.siteCredit, user.id]
      );
    }
    // Optionally: log perk grant, send notification, etc.
  }
}

// Run daily at 2am
cron.schedule('0 2 * * *', grantPerksForDueUsers);

// For manual run/testing
if (process.env.NODE_ENV === 'development') {
  grantPerksForDueUsers().then(() => {
    console.log('Perks granted (manual run)');
    process.exit(0);
  });
}
