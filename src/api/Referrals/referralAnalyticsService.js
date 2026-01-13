import pool from "../../../database.js"

class ReferralAnalyticsService {
  async getDashboardStats() {
    // Get stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [stats] = await pool.query(
      `SELECT 
        -- Total Referral Links Created All time
        (SELECT COUNT(*) FROM referral_links) as total_referral_links,
        
        -- Sign Ups From Referrals Last 30 days
        (SELECT COUNT(*) FROM referral_events 
         WHERE event_type = 'SIGNUP' 
         AND created_at >= ?) as signups_last_30_days,
        
        -- KYC Verified Users Last 30 days
        (SELECT COUNT(DISTINCT referred_user_id) FROM referral_events 
         WHERE event_type = 'KYC_VERIFIED' 
         AND created_at >= ?) as kyc_verified_last_30_days,
        
        -- Valid & Rewarded This Month
        (SELECT COUNT(*) FROM referral_events 
         WHERE event_type = 'REWARD_PAID' 
         AND MONTH(created_at) = MONTH(CURRENT_DATE())
         AND YEAR(created_at) = YEAR(CURRENT_DATE())) as rewarded_this_month,
        
        -- Rewards Distributed Last 30 days
        (SELECT COALESCE(SUM(amount), 0) FROM referral_events 
         WHERE event_type = 'REWARD_PAID' 
         AND created_at >= ?) as rewards_distributed_last_30_days,
        
        -- Active Referrers This month
        (SELECT COUNT(DISTINCT referrer_id) FROM referral_events 
         WHERE MONTH(created_at) = MONTH(CURRENT_DATE())
         AND YEAR(created_at) = YEAR(CURRENT_DATE())
         AND event_type IN ('REWARD_PAID', 'SIGNUP')) as active_referrers_this_month,
        
        -- Validation Rate
        (SELECT 
          ROUND(
            (SELECT COUNT(*) FROM referral_events WHERE event_type = 'REWARD_PAID') 
            / 
            NULLIF((SELECT COUNT(*) FROM referral_events WHERE event_type = 'KYC_VERIFIED'), 0) 
            * 100, 
          2)
        ) as validation_rate_percent
       FROM dual`,
      [thirtyDaysAgo, thirtyDaysAgo, thirtyDaysAgo]
    );
    
    return stats[0];
  }

async getTopReferrers({
  page = 1,
  limit = 50,
  start_date,
  end_date,
  tier
}) {
  const offset = (page - 1) * limit;

  let whereClauses = [];
  const params = [];

  // Date filters
  if (start_date && end_date) {
    whereClauses.push("re.created_at BETWEEN ? AND ?");
    params.push(start_date, end_date);
  } else if (start_date) {
    whereClauses.push("re.created_at >= ?");
    params.push(start_date);
  } else if (end_date) {
    whereClauses.push("re.created_at <= ?");
    params.push(end_date);
  }

  // Tier filter
  if (tier) {
    whereClauses.push("rt.name = ?");
    params.push(tier);
  }

  const whereSQL =
    whereClauses.length > 0
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

  /* ================= TOTAL COUNT ================= */
  const [totalCount] = await pool.query(
    `
    SELECT COUNT(DISTINCT u.id) AS total
    FROM users u
    LEFT JOIN user_referral_stats urs ON u.id = urs.user_id
    LEFT JOIN referral_tiers rt ON urs.current_tier_id = rt.id
    LEFT JOIN referral_events re ON u.id = re.referrer_id
    ${whereSQL}
    `,
    params
  );

  /* ================= MAIN QUERY ================= */
  const [referrers] = await pool.query(
    `
    SELECT
      BIN_TO_UUID(u.id) AS user_id,
      CONCAT(u.first_name, ' ', u.last_name) AS user_name,
      u.email,
      u.username,

      rt.name AS tier,
      rt.color AS tier_color,

      urs.total_referrals,
      urs.successful_referrals,

      ROUND(
        (urs.successful_referrals / NULLIF(urs.total_referrals, 0)) * 100,
        2
      ) AS success_rate,

      urs.total_earned,
      urs.this_month_earned,

      COUNT(
        DISTINCT CASE
          WHEN MONTH(re.created_at) = MONTH(CURRENT_DATE())
          THEN re.id
        END
      ) AS this_month_referrals

    FROM users u
    LEFT JOIN user_referral_stats urs ON u.id = urs.user_id
    LEFT JOIN referral_tiers rt ON urs.current_tier_id = rt.id
    LEFT JOIN referral_events re
      ON u.id = re.referrer_id
      AND re.event_type IN ('SIGNUP', 'REWARD_PAID')

    ${whereSQL}

    GROUP BY
      u.id,
      rt.name,
      rt.color,
      urs.total_referrals,
      urs.successful_referrals,
      urs.total_earned,
      urs.this_month_earned

    ORDER BY
      urs.total_earned DESC,
      urs.successful_referrals DESC

    LIMIT ? OFFSET ?
    `,
    [...params, parseInt(limit), offset]
  );

  return {
    data: referrers,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalCount[0]?.total || 0,
      totalPages: Math.ceil((totalCount[0]?.total || 0) / limit)
    }
  };
}


  async getDetailedAnalytics(filters) {
    const {
      start_date,
      end_date,
      status = 'ALL'
    } = filters;
    
    let dateFilter = '';
    const params = [];
    
    if (start_date && end_date) {
      dateFilter = 'WHERE created_at BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }
    
    if (status !== 'ALL') {
      const statusFilter = dateFilter ? 'AND status = ?' : 'WHERE status = ?';
      dateFilter += dateFilter ? ` ${statusFilter}` : `${statusFilter}`;
      params.push(status);
    }
    
    const [analytics] = await pool.query(
      `SELECT 
         -- Total referral links created
         (SELECT COUNT(*) FROM referral_links) as total_referral_links,
         
         -- Invited users (sign-ups)
         (SELECT COUNT(*) FROM referral_events 
          WHERE event_type = 'SIGNUP' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}) as invited_users,
         
         -- Conversion rate
         ROUND(
           (SELECT COUNT(*) FROM referral_events WHERE event_type = 'SIGNUP' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''})
           / 
           NULLIF((SELECT COUNT(*) FROM referral_events WHERE event_type = 'CLICK' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}), 0)
           * 100, 2
         ) as conversion_rate_percent,
         
         -- KYC passed
         (SELECT COUNT(*) FROM referral_events 
          WHERE event_type = 'KYC_VERIFIED' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}) as kyc_passed,
         
         -- Total KYC users (for percentage)
         (SELECT COUNT(*) FROM users 
          WHERE kyc_status = 'verified' 
          AND id IN (SELECT referred_user_id FROM referral_events)) as total_kyc_users,
         
         -- Validated referrals (REWARD_PAID)
         (SELECT COUNT(*) FROM referral_events 
          WHERE event_type = 'REWARD_PAID' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}) as validated_referrals,
         
         -- Validation rate
         ROUND(
           (SELECT COUNT(*) FROM referral_events WHERE event_type = 'REWARD_PAID' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''})
           / 
           NULLIF((SELECT COUNT(*) FROM referral_events WHERE event_type = 'KYC_VERIFIED' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}), 0)
           * 100, 2
         ) as validation_rate_percent,
         
         -- Total rewards distributed
         (SELECT COALESCE(SUM(amount), 0) FROM referral_events 
          WHERE event_type = 'REWARD_PAID' ${dateFilter ? 'AND ' + dateFilter.replace('WHERE ', '') : ''}) as total_rewards_distributed
       FROM dual`,
      params
    );
    
    return analytics[0];
  }

  async exportData({ start_date, end_date, format = 'csv' }) {
    const [data] = await pool.query(
      `SELECT 
         re.*,
         CONCAT(u1.first_name, ' ', u1.last_name) as referrer_name,
         u1.email as referrer_email,
         CONCAT(u2.first_name, ' ', u2.last_name) as referred_user_name,
         u2.email as referred_user_email,
         rl.referral_code
       FROM referral_events re
       LEFT JOIN users u1 ON re.referrer_id = u1.id
       LEFT JOIN users u2 ON re.referred_user_id = u2.id
       LEFT JOIN referral_links rl ON re.referral_link_id = rl.id
       WHERE re.created_at BETWEEN ? AND ?
       ORDER BY re.created_at DESC`,
      [start_date || '2000-01-01', end_date || new Date().toISOString()]
    );
    
    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map(row => 
        Object.values(row).map(value => 
          typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value
        ).join(',')
      );
      
      return [headers, ...rows].join('\n');
    }
    
    return data;
  }
}

export default new ReferralAnalyticsService();