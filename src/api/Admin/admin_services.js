import pool from "../../../database.js";


// Helper function to activate user account after verification
async function activateUserAccount(user_id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Create wallets if they don't exist
    const [existingWallets] = await connection.query(
      `SELECT id FROM wallets WHERE user_id = ?`,
      [user_id]
    );

    if (existingWallets.length === 0) {
      await connection.query(
        `INSERT INTO wallets (id, user_id, type) VALUES 
         (UUID(), ?, 'CASH'),
         (UUID(), ?, 'CREDIT')`,
        [user_id, user_id]
      );
    }

    // Create user points record if it doesn't exist
    const [existingPoints] = await connection.query(
      `SELECT id FROM user_points WHERE user_id = ?`,
      [user_id]
    );

    if (existingPoints.length === 0) {
      await connection.query(
        `INSERT INTO user_points (id, user_id) VALUES (UUID(), ?)`,
        [user_id]
      );
    }

    // Create user streaks record if it doesn't exist
    const [existingStreaks] = await connection.query(
      `SELECT id FROM user_streaks WHERE user_id = ?`,
      [user_id]
    );

    if (existingStreaks.length === 0) {
      await connection.query(
        `INSERT INTO user_streaks (id, user_id) VALUES (UUID(), ?)`,
        [user_id]
      );
    }

    // Send welcome email (you would integrate with your email service)
    // await sendWelcomeEmail(user_id);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Error activating user account:", error);
    throw error;
  } finally {
    connection.release();
  }
}
// Helper function to calculate age from DOB
function calculateAge(dob) {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}
export const AdminService = {
  getDashboardStats: async () => {
    try {
      // Total users
      const [totalUsers] = await pool.query(
        `SELECT COUNT(*) as count FROM users WHERE role = 'user'`
      );

      // Active competitions
      const [activeCompetitions] = await pool.query(
        `SELECT COUNT(*) as count FROM competitions WHERE status = 'ACTIVE'`
      );

      // Pending withdrawals
      const [pendingWithdrawals] = await pool.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount 
         FROM withdrawals WHERE status = 'PENDING'`
      );

      // Today's revenue
      const [todayRevenue] = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) as amount 
         FROM purchases WHERE status = 'PAID' AND DATE(created_at) = CURDATE()`
      );

      // Recent activities
      const [recentActivities] = await pool.query(
        `SELECT aa.*, u.username as admin_name 
         FROM admin_activities aa 
         JOIN users u ON aa.admin_id = u.id 
         ORDER BY aa.created_at DESC 
         LIMIT 10`
      );

      return {
        total_users: totalUsers[0].count,
        active_competitions: activeCompetitions[0].count,
        pending_withdrawals: {
          count: pendingWithdrawals[0].count,
          total_amount: parseFloat(pendingWithdrawals[0].total_amount),
        },
        today_revenue: parseFloat(todayRevenue[0].amount),
        recent_activities: recentActivities,
      };
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      throw new Error("Failed to get dashboard statistics");
    }
  },

getAllUsers: async ({ page, limit, search, role, status }) => {
  try {
    const offset = (page - 1) * limit;
    let query = `
      SELECT
        BIN_TO_UUID(u.id) AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.role,
        u.is_active,
        u.age_verified,
        u.created_at,
        u.last_login,
        wc.balance AS cash_balance,
        wcr.balance AS credit_balance,
        st.tier_name,
        st.tier_level,
        st.badge_name,
        st.monthly_price,
        st.benefits,
        us.status AS subscription_status,
        us.start_date AS subscription_start,
        us.end_date AS subscription_end,
        us.auto_renew,
        us.next_payment_date,
        (
          SELECT COUNT(*)
          FROM purchases p
          WHERE p.user_id = u.id AND p.status = 'PAID'
        ) AS total_purchases,
        (
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.user_id = u.id
        ) AS total_tickets
      FROM users u
      LEFT JOIN wallets wc 
        ON u.id = wc.user_id AND wc.type = 'CASH'
      LEFT JOIN wallets wcr 
        ON u.id = wcr.user_id AND wcr.type = 'CREDIT'
      LEFT JOIN user_subscriptions us 
        ON u.id = us.user_id 
        AND us.status = 'ACTIVE' 
        AND us.end_date >= CURDATE()
      LEFT JOIN subscription_tiers st 
        ON us.tier_id = st.id
    `;

    let countQuery = `SELECT COUNT(*) AS total FROM users u`;

    const params = [];
    const countParams = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
      countParams.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause
    if (conditions.length > 0) {
      const whereClause = ` WHERE ${conditions.join(" AND ")}`;
      query += whereClause;
      countQuery += whereClause;
    }

    // Pagination
    query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [users] = await pool.query(query, params);
    const [totalResult] = await pool.query(countQuery, countParams);

    // Parse benefits JSON and format subscription data
    const formattedUsers = users.map(user => {
      let benefits = {};
      try {
        if (user.benefits) {
          benefits = typeof user.benefits === 'string' 
            ? JSON.parse(user.benefits) 
            : user.benefits;
        }
      } catch (error) {
        console.error('Error parsing benefits:', error);
      }

      return {
        ...user,
        subscription: user.tier_name ? {
          tier_name: user.tier_name,
          tier_level: user.tier_level,
          badge_name: user.badge_name,
          monthly_price: user.monthly_price,
          benefits: benefits,
          status: user.subscription_status,
          start_date: user.subscription_start,
          end_date: user.subscription_end,
          auto_renew: user.auto_renew,
          next_payment_date: user.next_payment_date,
          is_active: user.subscription_status === 'ACTIVE' && 
                    user.subscription_end && 
                    new Date(user.subscription_end) >= new Date()
        } : null
      };
    });

    return {
      users: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        pages: Math.ceil(totalResult[0].total / limit),
      },
    };
  } catch (error) {
    console.error("Error getting users:", error);
    throw new Error("Failed to get users");
  }
},

getUserDetails: async (user_id) => {
  try {
    const [users] = await pool.query(
      `
      SELECT 
        BIN_TO_UUID(u.id) AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) AS full_name,
        u.phone,
        u.role,
        u.is_active,
        u.age_verified,
        u.created_at,
        u.last_login,
        u.date_of_birth,
        u.country,
        
        -- Wallet balances
        wc.balance AS cash_balance,
        wcr.balance AS credit_balance,
        wp.balance AS points_balance,
        
        -- User stats (only include if tables exist)
        up.total_points,
        us.current_streak,
        us.longest_streak,
        
        -- Referral stats
        urs.total_referrals,
        urs.successful_referrals,
        urs.total_earned,
        urs.this_month_earned,
        rt.name AS referral_tier_name,
        rt.color AS referral_tier_color,
        rt.cash_reward AS tier_cash_reward,
        rt.points_reward AS tier_points_reward,
        
        -- Referral link info
        rl.referral_code,
        rl.total_clicks,
        rl.total_signups,
        rl.total_successful,
        rl.total_earned AS link_total_earned
        
      FROM users u
      LEFT JOIN wallets wc 
        ON u.id = wc.user_id AND wc.type = 'CASH'
      LEFT JOIN wallets wcr 
        ON u.id = wcr.user_id AND wc.type = 'CREDIT'
      LEFT JOIN wallets wp 
        ON u.id = wp.user_id AND wc.type = 'POINTS'
      LEFT JOIN user_points up 
        ON u.id = up.user_id
      LEFT JOIN user_streaks us 
        ON u.id = us.user_id
      LEFT JOIN user_referral_stats urs 
        ON u.id = urs.user_id
      LEFT JOIN referral_tiers rt 
        ON urs.current_tier_id = rt.id
      LEFT JOIN referral_links rl 
        ON u.id = rl.user_id
      WHERE u.id = UUID_TO_BIN(?)
      `,
      [user_id]
    );

    if (users.length === 0) return null;

    const user = users[0];

    // Helper function to calculate age
    const calculateAge = (dob) => {
      if (!dob) return null;
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    };

    // -------------------------------
    // 2. Verification/KYC Details (if table exists)
    // -------------------------------
    let verifications = [];
    try {
      [verifications] = await pool.query(
        `
        SELECT 
          BIN_TO_UUID(v.id) AS id,
          v.status,
          v.verification_type,
          v.document_type,
          v.document_number,
          v.verified_by,
          v.verified_at,
          v.rejected_reason,
          v.created_at,
          u.email AS verified_by_email,
          CONCAT(u.first_name, ' ', u.last_name) AS verified_by_name
        FROM verifications v
        LEFT JOIN users u ON v.verified_by = u.id
        WHERE v.user_id = UUID_TO_BIN(?)
        ORDER BY v.created_at DESC
        LIMIT 1
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("Verifications table doesn't exist or error:", error.message);
    }

    // -------------------------------
    // 3. Competition Stats (without results table)
    // -------------------------------
    let competitionStats = [{ total_competitions_entered: 0, total_tickets_purchased: 0, total_amount_spent: 0, competitions_won: 0, total_prizes_won: 0 }];
    try {
      // First try without results table
      [competitionStats] = await pool.query(
        `
        SELECT 
          COUNT(DISTINCT p.competition_id) AS total_competitions_entered,
          COUNT(p.id) AS total_tickets_purchased,
          SUM(p.total_amount) AS total_amount_spent,
          COUNT(DISTINCT CASE WHEN w.user_id IS NOT NULL THEN p.competition_id END) AS competitions_won,
          SUM(CASE WHEN w.user_id IS NOT NULL THEN w.prize_amount ELSE 0 END) AS total_prizes_won
        FROM purchases p
        LEFT JOIN winners w ON p.user_id = w.user_id AND p.competition_id = w.competition_id
        WHERE p.user_id = UUID_TO_BIN(?)
          AND p.status = 'PAID'
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("Error getting competition stats (trying simplified query):", error.message);
      
      // Try simplified query without winners table
      try {
        [competitionStats] = await pool.query(
          `
          SELECT 
            COUNT(DISTINCT p.competition_id) AS total_competitions_entered,
            COUNT(p.id) AS total_tickets_purchased,
            SUM(p.total_amount) AS total_amount_spent
          FROM purchases p
          WHERE p.user_id = UUID_TO_BIN(?)
            AND p.status = 'PAID'
          `,
          [user_id]
        );
        // Add default values for missing fields
        competitionStats[0].competitions_won = 0;
        competitionStats[0].total_prizes_won = 0;
        competitionStats[0].first_place_wins = 0;
      } catch (simpleError) {
        console.warn("Simplified query also failed:", simpleError.message);
      }
    }

    // -------------------------------
    // 4. Recent Competitions (simplified without results)
    // -------------------------------
    let recentCompetitions = [];
    try {
      [recentCompetitions] = await pool.query(
        `
        SELECT 
          BIN_TO_UUID(c.id) AS competition_id,
          c.title AS competition_title,
          c.status AS competition_status,
          c.draw_date,
          COUNT(p.id) AS tickets_purchased,
          SUM(p.total_amount) AS total_spent
        FROM purchases p
        INNER JOIN competitions c ON p.competition_id = c.id
        WHERE p.user_id = UUID_TO_BIN(?)
          AND p.status = 'PAID'
        GROUP BY c.id, c.title, c.status, c.draw_date
        ORDER BY p.created_at DESC
        LIMIT 5
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("Error getting recent competitions:", error.message);
    }

    // -------------------------------
    // 5. Transaction History (check each table exists)
    // -------------------------------
    let transactions = [];
    try {
      // Build query dynamically based on available tables
      let transactionQueries = [];
      let queryParams = [];
      
      // Check purchases table
      transactionQueries.push(`
        SELECT 
          'PURCHASE' AS transaction_type,
          BIN_TO_UUID(p.id) AS transaction_id,
          p.total_amount AS amount,
          p.status,
          p.created_at AS date_time,
          CONCAT('Competition: ', c.title) AS description
        FROM purchases p
        LEFT JOIN competitions c ON p.competition_id = c.id
        WHERE p.user_id = UUID_TO_BIN(?)
      `);
      queryParams.push(user_id);
      
      // Check withdrawals table
      try {
        await pool.query('SELECT 1 FROM withdrawals LIMIT 1');
        transactionQueries.push(`
          SELECT 
            'WITHDRAWAL' AS transaction_type,
            BIN_TO_UUID(w.id) AS transaction_id,
            w.amount,
            w.status,
            w.requested_at AS date_time,
            CONCAT('Withdrawal to ', w.payment_method) AS description
          FROM withdrawals w
          WHERE w.user_id = UUID_TO_BIN(?)
        `);
        queryParams.push(user_id);
      } catch (error) {
        console.warn("Withdrawals table doesn't exist:", error.message);
      }
      
      // Check deposits table
      try {
        await pool.query('SELECT 1 FROM deposits LIMIT 1');
        transactionQueries.push(`
          SELECT 
            'DEPOSIT' AS transaction_type,
            BIN_TO_UUID(d.id) AS transaction_id,
            d.amount,
            d.status,
            d.created_at AS date_time,
            CONCAT('Deposit via ', d.payment_method) AS description
          FROM deposits d
          WHERE d.user_id = UUID_TO_BIN(?)
        `);
        queryParams.push(user_id);
      } catch (error) {
        console.warn("Deposits table doesn't exist:", error.message);
      }
      
      // Check referral_events table
      try {
        await pool.query('SELECT 1 FROM referral_events LIMIT 1');
        transactionQueries.push(`
          SELECT 
            'REFERRAL_REWARD' AS transaction_type,
            BIN_TO_UUID(re.id) AS transaction_id,
            re.amount,
            re.status,
            re.created_at AS date_time,
            CONCAT('Referral reward from ', ru.email) AS description
          FROM referral_events re
          LEFT JOIN users ru ON re.referred_user_id = ru.id
          WHERE re.referrer_id = UUID_TO_BIN(?)
            AND re.event_type = 'REWARD_PAID'
        `);
        queryParams.push(user_id);
      } catch (error) {
        console.warn("Referral_events table doesn't exist:", error.message);
      }
      
      if (transactionQueries.length > 0) {
        const fullQuery = transactionQueries.join(' UNION ALL ') + ' ORDER BY date_time DESC LIMIT 10';
        [transactions] = await pool.query(fullQuery, queryParams);
      }
    } catch (error) {
      console.warn("Error getting transactions:", error.message);
    }

    // -------------------------------
    // 6. Recent Referrals (if table exists)
    // -------------------------------
    let recentReferrals = [];
    try {
      await pool.query('SELECT 1 FROM referral_events LIMIT 1');
      [recentReferrals] = await pool.query(
        `
        SELECT 
          BIN_TO_UUID(ru.id) AS referred_user_id,
          ru.email AS referred_user_email,
          CONCAT(ru.first_name, ' ', ru.last_name) AS referred_user_name,
          re.event_type,
          re.status,
          re.amount,
          re.reward_type,
          re.created_at,
          CASE 
            WHEN ru.age_verified = TRUE THEN 'KYC_VERIFIED'
            WHEN ru.created_at IS NOT NULL THEN 'SIGNUP'
            ELSE 'CLICK'
          END AS current_status
        FROM referral_events re
        INNER JOIN users ru ON re.referred_user_id = ru.id
        WHERE re.referrer_id = UUID_TO_BIN(?)
        ORDER BY re.created_at DESC
        LIMIT 10
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("Referral_events table doesn't exist or error:", error.message);
    }

    // -------------------------------
    // 7. Internal Notes (if table exists)
    // -------------------------------
    let internalNotes = [];
    try {
      await pool.query('SELECT 1 FROM user_notes LIMIT 1');
      [internalNotes] = await pool.query(
        `
        SELECT 
          BIN_TO_UUID(n.id) AS id,
          n.note_content,
          n.note_type,
          n.is_important,
          n.created_at,
          BIN_TO_UUID(u.id) AS created_by_id,
          CONCAT(u.first_name, ' ', u.last_name) AS created_by_name,
          u.email AS created_by_email
        FROM user_notes n
        LEFT JOIN users u ON n.created_by = u.id
        WHERE n.user_id = UUID_TO_BIN(?)
        ORDER BY n.created_at DESC
        LIMIT 10
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("User_notes table doesn't exist or error:", error.message);
    }

    // -------------------------------
    // 8. User Activity Logs (if table exists)
    // -------------------------------
    let recentActivity = [];
    try {
      await pool.query('SELECT 1 FROM user_activity_logs LIMIT 1');
      [recentActivity] = await pool.query(
        `
        SELECT 
          activity_type,
          activity_details,
          ip_address,
          user_agent,
          created_at
        FROM user_activity_logs
        WHERE user_id = UUID_TO_BIN(?)
        ORDER BY created_at DESC
        LIMIT 10
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("User_activity_logs table doesn't exist or error:", error.message);
    }

    // -------------------------------
    // 9. Wallet Details Breakdown
    // -------------------------------
    let walletBreakdown = [];
    try {
      // Check if transactions table exists
      await pool.query('SELECT 1 FROM transactions LIMIT 1');
      [walletBreakdown] = await pool.query(
        `
        SELECT 
          w.type AS wallet_type,
          w.balance,

          w.updated_at,
          (SELECT SUM(amount) FROM transactions WHERE wallet_id = w.id AND type = 'CREDIT') AS total_credited,
          (SELECT SUM(amount) FROM transactions WHERE wallet_id = w.id AND type = 'DEBIT') AS total_debited
        FROM wallets w
        WHERE w.user_id = UUID_TO_BIN(?)
        ORDER BY w.type
        `,
        [user_id]
      );
    } catch (error) {
      console.warn("Transactions table doesn't exist, using simple wallet query:", error.message);
      // Simple wallet query without transaction totals
      [walletBreakdown] = await pool.query(
        `
        SELECT 
          w.type AS wallet_type,
          w.balance,

          w.updated_at
        FROM wallets w
        WHERE w.user_id = UUID_TO_BIN(?)
        ORDER BY w.type
        `,
        [user_id]
      );
    }

    // -------------------------------
    // Final Structured Response
    // -------------------------------
    return {
      // Profile Header Info
      profile: {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        role: user.role,
        is_active: user.is_active,
        created_at: user.created_at,
        last_login: user.last_login,
        dob: user.date_of_birth,
        age: user.date_of_birth ? calculateAge(user.date_of_birth) : null,
        location: {
          country: user.country,
          city: user.city,
          address: user.address,
          postal_code: user.postal_code
        }
      },

      // Stats Cards
      stats: {
        total_competitions: competitionStats[0]?.total_competitions_entered || 0,
        total_spent: competitionStats[0]?.total_amount_spent || 0,
        total_tickets: competitionStats[0]?.total_tickets_purchased || 0,
        total_referrals: user.total_referrals || 0,
        successful_referrals: user.successful_referrals || 0,
        competitions_won: competitionStats[0]?.competitions_won || 0,
        total_prizes_won: competitionStats[0]?.total_prizes_won || 0,
        first_place_wins: competitionStats[0]?.first_place_wins || 0
      },

      // Wallet Information
      wallet: {
        cash_balance: user.cash_balance || 0,
        credit_balance: user.credit_balance || 0,
        points_balance: user.points_balance || 0,
        total_balance: (user.cash_balance || 0) + (user.credit_balance || 0),
        breakdown: walletBreakdown,
        referral_earnings: user.total_earned || 0,
        this_month_earnings: user.this_month_earned || 0
      },

      // Verification Status
      verification: verifications[0] ? {
        status: verifications[0].status,
        verification_type: verifications[0].verification_type,
        document_type: verifications[0].document_type,
        verified_at: verifications[0].verified_at,
        verified_by: verifications[0].verified_by_name,
        verified_by_email: verifications[0].verified_by_email,
        is_verified: verifications[0].status === 'APPROVED',
        age_verified: user.age_verified
      } : {
        status: 'NOT_SUBMITTED',
        is_verified: false,
        age_verified: user.age_verified
      },

      // Referral Information
      referral: {
        tier: {
          name: user.referral_tier_name || 'Bronze',
          color: user.referral_tier_color || '#CD7F32',
          cash_reward: user.tier_cash_reward || 0,
          points_reward: user.tier_points_reward || 0
        },
        stats: {
          total_referrals: user.total_referrals || 0,
          successful_referrals: user.successful_referrals || 0,
          total_earned: user.total_earned || 0,
          this_month_earned: user.this_month_earned || 0
        },
        link: {
          referral_code: user.referral_code,
          total_clicks: user.total_clicks || 0,
          total_signups: user.total_signups || 0,
          total_successful: user.total_successful || 0,
          total_earned: user.link_total_earned || 0
        },
        recent_referrals: recentReferrals
      },

      // Competition Activity
      competitions: {
        recent: recentCompetitions,
        stats: competitionStats[0] || {}
      },

      // Transaction History
      transactions: transactions,

      // Internal Notes
      internal_notes: internalNotes,

      // Activity Logs
      recent_activity: recentActivity,

      // Additional Info
      additional_info: {
        current_streak: user.current_streak || 0,
        longest_streak: user.longest_streak || 0,
        total_points: user.total_points || 0,
        joined_date: user.created_at,
        days_since_joined: Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24))
      }
    };
  } catch (error) {
    console.error("Error getting user details:", error);
    throw new Error("Failed to get user details");
  }
},


// Get user statistics for dashboard
getUserStats: async () => {
  try {
    const [
      totalUsersResult,
      activeUsersTodayResult,
      pendingVerificationResult,
      suspendedUsersResult,
      monthlyGrowthResult,
      newUsersTodayResult,
      recentActivitiesResult,
      activitySummaryResult  
    ] = await Promise.all([
      //aklilu:Total Users
      pool.query('SELECT COUNT(*) as total FROM users'),

      //aklilu:Active Users Today - users who logged in today - USING last_login
      pool.query(`
        SELECT COUNT(*) as active_today 
        FROM users 
        WHERE DATE(last_login) = CURDATE()
        AND is_active = TRUE
      `),
      
      //aklilu:Pending Verification Review -age verification
      pool.query(`
        SELECT COUNT(*) as pending_verification 
        FROM users 
        WHERE age_verified = FALSE 
        AND is_active = TRUE
      `),
      
      //aklilu:Suspended Users -is_active = false
      pool.query(`
        SELECT COUNT(*) as suspended 
        FROM users 
        WHERE is_active = FALSE
      `),
      
      // aklillu:Monthly growth percentage
      pool.query(`
        WITH monthly_stats AS (
          SELECT 
            COUNT(*) as current_month_count,
            (SELECT COUNT(*) 
             FROM users 
             WHERE created_at < DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
            ) as previous_month_count
          FROM users 
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        )
        SELECT 
          current_month_count,
          previous_month_count,
          CASE 
            WHEN previous_month_count = 0 THEN 100
            ELSE ROUND(((current_month_count - previous_month_count) / previous_month_count * 100), 1)
          END as growth_percentage
        FROM monthly_stats
      `),
      
      //aklilu:New users today
      pool.query(`
        SELECT COUNT(*) as new_users_today 
        FROM users 
        WHERE DATE(created_at) = CURDATE()
      `),

      // aklilu:Recent user activities (last 10 activities)
      pool.query(`
        SELECT 
          BIN_TO_UUID(ua.id) as activity_id,
          BIN_TO_UUID(ua.user_id) as user_id,
          u.username,
          u.email,
          u.profile_photo,
          ua.action,
          ua.module,
          ua.target_id,
          ua.ip_address,
          ua.details,
          ua.created_at,
          TIMESTAMPDIFF(MINUTE, ua.created_at, NOW()) as minutes_ago
        FROM user_activities ua
        LEFT JOIN users u ON ua.user_id = u.id
        WHERE ua.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) -- Last 7 days
        ORDER BY ua.created_at DESC
        LIMIT 10
      `),

      // aklilu:Activity summary for last 7 days
      pool.query(`
        SELECT 
          DATE(ua.created_at) as activity_date,
          COUNT(*) as activity_count,
          COUNT(DISTINCT ua.user_id) as unique_users
        FROM user_activities ua
        WHERE ua.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(ua.created_at)
        ORDER BY activity_date DESC
      `)
    ]);
  
    // Extract data from results
    const totalUsers = totalUsersResult[0][0]?.total || 0;
    const activeUsersToday = activeUsersTodayResult[0][0]?.active_today || 0;
    const pendingVerification = pendingVerificationResult[0][0]?.pending_verification || 0;
    const suspendedUsers = suspendedUsersResult[0][0]?.suspended || 0;
    const monthlyGrowth = monthlyGrowthResult[0][0]?.growth_percentage || 0;
    const newUsersToday = newUsersTodayResult[0][0]?.new_users_today || 0;
    const recentActivities = recentActivitiesResult[0] || [];
    const activitySummary = activitySummaryResult[0] || [];
    
    // Calculate percentage of active users vs total
    const activePercentage = totalUsers > 0 
      ? ((activeUsersToday / totalUsers) * 100).toFixed(1) 
      : '0.0';

    //akilu:Calculate total activities in last 7 days
    const totalActivities7Days = activitySummary.reduce((sum, day) => sum + (day.activity_count || 0), 0);
    const avgActivitiesPerDay = activitySummary.length > 0 
      ? (totalActivities7Days / activitySummary.length).toFixed(1) 
      : 0;

    //aklilu:Parse activity details and format time
    const formattedRecentActivities = recentActivities.map(activity => {
      let timeAgo = '';
      const minutes = activity.minutes_ago || 0;
      
      if (minutes < 1) {
        timeAgo = 'Just now';
      } else if (minutes < 60) {
        timeAgo = `${minutes} min${minutes === 1 ? '' : 's'} ago`;
      } else if (minutes < 1440) {
        const hours = Math.floor(minutes / 60);
        timeAgo = `${hours} hour${hours === 1 ? '' : 's'} ago`;
      } else {
        const days = Math.floor(minutes / 1440);
        timeAgo = `${days} day${days === 1 ? '' : 's'} ago`;
      }

      //aklilu:Parse JSON details if exists
      let parsedDetails = {};
      try {
        if (activity.details) {
          parsedDetails = typeof activity.details === 'string' 
            ? JSON.parse(activity.details) 
            : activity.details;
        }
      } catch (error) {
        console.error('Error parsing activity details:', error);
      }

      // // Determine icon based on module/action
      // let icon = 'default';
      // let color = 'gray';
      
      // const module = activity.module?.toLowerCase() || '';
      // const action = activity.action?.toLowerCase() || '';
      
      // if (module.includes('auth') || action.includes('login') || action.includes('register')) {
      //   icon = 'user';
      //   color = 'blue';
      // } else if (module.includes('game') || module.includes('competition')) {
      //   icon = 'game';
      //   color = 'green';
      // } else if (module.includes('payment') || module.includes('purchase') || module.includes('deposit')) {
      //   icon = 'payment';
      //   color = 'purple';
      // } else if (module.includes('referral')) {
      //   icon = 'referral';
      //   color = 'orange';
      // } else if (module.includes('profile')) {
      //   icon = 'profile';
      //   color = 'pink';
      // } else if (action.includes('update') || action.includes('edit')) {
      //   icon = 'edit';
      //   color = 'yellow';
      // }

      // Format action text for display
      let displayAction = activity.action || 'Unknown Action';
      if (displayAction.includes('_')) {
        displayAction = displayAction.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }

      return {
        id: activity.activity_id,
        userId: activity.user_id,
        username: activity.username || 'Unknown User',
        email: activity.email || '',
        profilePhoto: activity.profile_photo,
        action: displayAction,
        module: activity.module || 'Unknown Module',
        targetId: activity.target_id,
        ipAddress: activity.ip_address,
        details: parsedDetails,
        timestamp: activity.created_at,
        timeAgo: timeAgo,
        // icon: icon,
        // color: color,
        formattedDate: new Date(activity.created_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      };
    });

    return {
      // Basic user stats
      total_users: totalUsers,
      total_users_formatted: totalUsers.toLocaleString(),
      monthly_growth: `${monthlyGrowth}%`,
      monthly_growth_raw: monthlyGrowth,
      active_users_today: activeUsersToday,
      active_users_today_formatted: activeUsersToday.toLocaleString(),
      active_percentage: `${activePercentage}%`,
      pending_verification: pendingVerification,
      pending_verification_formatted: pendingVerification.toLocaleString(),
      suspended_users: suspendedUsers,
      suspended_users_formatted: suspendedUsers.toLocaleString(),
      new_users_today: newUsersToday,
      new_users_today_formatted: newUsersToday.toLocaleString(),

      //aklilu:Activity statistics
      activity_stats: {
        total_last_7_days: totalActivities7Days,
        total_last_7_days_formatted: totalActivities7Days.toLocaleString(),
        average_daily_activities: parseFloat(avgActivitiesPerDay),
        unique_users_last_7_days: activitySummary.reduce((sum, day) => sum + (day.unique_users || 0), 0),
        daily_breakdown: activitySummary.map(day => ({
          date: day.activity_date,
          date_formatted: new Date(day.activity_date).toLocaleDateString('en-GB', {
            weekday: 'short',
            day: '2-digit',
            month: 'short'
          }),
          activity_count: day.activity_count,
          unique_users: day.unique_users
        })),
        recent_activities_count: recentActivities.length
      },

      //aklilu:Recent activities
      recent_activities: formattedRecentActivities,

      // aklilu:Activity by module (if needed)
      activity_by_module: await (async () => {
        try {
          const [moduleResult] = await pool.query(`
            SELECT 
              ua.module,
              COUNT(*) as count
            FROM user_activities ua
            WHERE ua.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            GROUP BY ua.module
            ORDER BY count DESC
            LIMIT 5
          `);
          return moduleResult;
        } catch (error) {
          console.error('Error getting activity by module:', error);
          return [];
        }
      })(),

      // aklilu:Most active users
      most_active_users: await (async () => {
        try {
          const [activeUsersResult] = await pool.query(`
            SELECT 
              BIN_TO_UUID(u.id) as user_id,
              u.username,
              u.email,
              u.profile_photo,
              COUNT(ua.id) as activity_count,
              MAX(ua.created_at) as last_activity
            FROM users u
            LEFT JOIN user_activities ua ON u.id = ua.user_id
            WHERE ua.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
              AND u.role = 'USER'
            GROUP BY u.id, u.username, u.email, u.profile_photo
            ORDER BY activity_count DESC
            LIMIT 5
          `);
          
          return activeUsersResult.map(user => ({
            ...user,
            last_activity_formatted: user.last_activity 
              ? new Date(user.last_activity).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : 'No activity'
          }));
        } catch (error) {
          console.error('Error getting most active users:', error);
          return [];
        }
      })()
    };
  } catch (error) {
    console.error("Error getting user stats:", error);
    throw new Error("Failed to get user statistics");
  }
},

updateUserStatus: async (user_id, status, reason, admin_id) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update user status (you might want to add an is_active field)
      await connection.query(`UPDATE users SET age_verified = ? WHERE id = ?`, [
        status === "verified",
        user_id,
      ]);

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, resource_type, resource_id, ip_address)
         VALUES (UUID(), ?, ?, 'USER', ?, ?)`,
        [
          admin_id,
          `Updated user status to ${status}: ${reason}`,
          user_id,
          req.ip,
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Error updating user status:", error);
      throw new Error("Failed to update user status");
    } finally {
      connection.release();
    }
  },

  // ... other service methods for competitions, withdrawals, analytics, etc.

  getSystemOverview: async (period) => {
    try {
      let dateFilter = "";
      switch (period) {
        case "7d":
          dateFilter = "DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
          break;
        case "30d":
          dateFilter = "DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
          break;
        case "90d":
          dateFilter = "DATE_SUB(CURDATE(), INTERVAL 90 DAY)";
          break;
        default:
          dateFilter = "DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
      }

      // User registrations over time
      const [userRegistrations] = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count 
         FROM users 
         WHERE created_at >= ? AND role = 'user'
         GROUP BY DATE(created_at) 
         ORDER BY date`,
        [dateFilter]
      );

      // Revenue over time
      const [revenueData] = await pool.query(
        `SELECT DATE(created_at) as date, SUM(total_amount) as revenue 
         FROM purchases 
         WHERE status = 'PAID' AND created_at >= ?
         GROUP BY DATE(created_at) 
         ORDER BY date`,
        [dateFilter]
      );

      // Competition performance
      const [competitionStats] = await pool.query(
        `SELECT 
          status,
          COUNT(*) as count,
          AVG(sold_tickets) as avg_tickets_sold,
          AVG(TIMESTAMPDIFF(HOUR, start_date, end_date)) as avg_duration_hours
         FROM competitions 
         WHERE created_at >= ?
         GROUP BY status`,
        [dateFilter]
      );

      return {
        user_registrations: userRegistrations,
        revenue: revenueData,
        competition_stats: competitionStats,
        period,
      };
    } catch (error) {
      console.error("Error getting system overview:", error);
      throw new Error("Failed to get system overview");
    }
  },
 
  getPendingVerifications: async ({ page, limit }) => {
    try {
      const offset = (page - 1) * limit;

      const [verifications] = await pool.query(
        `SELECT 
        uv.*,
        u.username,
        u.email,
        u.full_name,
        u.date_of_birth,
        u.created_at as user_joined,
        ua.address_line1,
        ua.city,
        ua.country
       FROM user_verifications uv
       JOIN users u ON uv.user_id = u.id
       LEFT JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_primary = TRUE
       WHERE uv.status = 'PENDING'
       ORDER BY uv.created_at ASC
       LIMIT ? OFFSET ?`,
        [parseInt(limit), offset]
      );

      const [total] = await pool.query(
        `SELECT COUNT(*) as total FROM user_verifications WHERE status = 'PENDING'`
      );

      return {
        verifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting pending verifications:", error);
      throw new Error("Failed to get pending verifications");
    }
  },

  getUserVerification: async (user_id) => {
    try {
      const [verifications] = await pool.query(
        `SELECT 
        uv.*,
        u.username,
        u.email,
        u.full_name,
        u.date_of_birth,
        u.profile_photo,
        u.created_at as user_joined,
        ua.address_line1,
        ua.address_line2,
        ua.city,
        ua.state,
        ua.postcode,
        ua.country,
        verifier.username as verified_by_name
       FROM user_verifications uv
       JOIN users u ON uv.user_id = u.id
       LEFT JOIN user_addresses ua ON u.id = ua.user_id AND ua.is_primary = TRUE
       LEFT JOIN users verifier ON uv.verified_by = verifier.id
       WHERE uv.user_id = ?`,
        [user_id]
      );

      if (verifications.length === 0) return null;

      // Get user's consent history
      const [consents] = await pool.query(
        `SELECT 
        uc.*,
        ld.type as document_type,
        ld.version as document_version
       FROM user_consents uc
       JOIN legal_documents ld ON uc.document_id = ld.id
       WHERE uc.user_id = ?
       ORDER BY uc.consented_at DESC`,
        [user_id]
      );

      return {
        ...verifications[0],
        consents,
      };
    } catch (error) {
      console.error("Error getting user verification:", error);
      throw new Error("Failed to get user verification");
    }
  },

  updateVerificationStatus: async (
    user_id,
    status,
    rejection_reason,
    admin_id
  ) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update verification record
      const updateData = {
        status,
        verified_by: admin_id,
        verified_at: new Date(),
      };

      if (status === "REJECTED" && rejection_reason) {
        updateData.rejection_reason = rejection_reason;
      }

      await connection.query(
        `UPDATE user_verifications SET ? WHERE user_id = ?`,
        [updateData, user_id]
      );

      // Update user's verification status and age_verified flag
      const userUpdateData = {
        verification_status: status,
      };

      if (status === "APPROVED") {
        userUpdateData.age_verified = true;
        userUpdateData.verification_status = "APPROVED";
      } else if (status === "REJECTED") {
        userUpdateData.age_verified = false;
        userUpdateData.verification_status = "REJECTED";
      }

      await connection.query(`UPDATE users SET ? WHERE id = ?`, [
        userUpdateData,
        user_id,
      ]);

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, resource_type, resource_id, ip_address)
       VALUES (UUID(), ?, ?, 'USER_VERIFICATION', ?, ?)`,
        [
          admin_id,
          `Updated verification status to ${status}`,
          user_id,
          "127.0.0.1",
        ]
      );

      await connection.commit();

      // If approved, activate user wallets and send welcome email
      if (status === "APPROVED") {
        await activateUserAccount(user_id);
      }
    } catch (error) {
      await connection.rollback();
      console.error("Error updating verification status:", error);
      throw new Error("Failed to update verification status");
    } finally {
      connection.release();
    }
  },

  getAllVerifications: async ({ page, limit, status }) => {
    try {
      const offset = (page - 1) * limit;

      let query = `
      SELECT 
        uv.*,
        u.username,
        u.email,
        u.full_name,
        u.date_of_birth,
        verifier.username as verified_by_name
      FROM user_verifications uv
      JOIN users u ON uv.user_id = u.id
      LEFT JOIN users verifier ON uv.verified_by = verifier.id
    `;

      let countQuery = `SELECT COUNT(*) as total FROM user_verifications uv`;
      const params = [];
      const countParams = [];

      if (status) {
        query += ` WHERE uv.status = ?`;
        countQuery += ` WHERE uv.status = ?`;
        params.push(status);
        countParams.push(status);
      }

      query += ` ORDER BY uv.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const [verifications] = await pool.query(query, params);
      const [total] = await pool.query(countQuery, countParams);

      return {
        verifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting all verifications:", error);
      throw new Error("Failed to get verifications");
    }
  },

  getUserConsents: async ({ page, limit }) => {
    try {
      const offset = (page - 1) * limit;

      const [consents] = await pool.query(
        `SELECT 
        u.id as user_id,
        u.username,
        u.email,
        u.full_name,
        u.marketing_consent,
        u.created_at as user_joined,
        MAX(CASE WHEN ld.type = 'TERMS' THEN uc.consented_at END) as terms_consented_at,
        MAX(CASE WHEN ld.type = 'PRIVACY' THEN uc.consented_at END) as privacy_consented_at,
        MAX(CASE WHEN ld.type = 'RESPONSIBLE_PLAY' THEN uc.consented_at END) as responsible_play_consented_at
       FROM users u
       LEFT JOIN user_consents uc ON u.id = uc.user_id
       LEFT JOIN legal_documents ld ON uc.document_id = ld.id
       GROUP BY u.id, u.username, u.email, u.full_name, u.marketing_consent, u.created_at
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
        [parseInt(limit), offset]
      );

      const [total] = await pool.query(`SELECT COUNT(*) as total FROM users`);

      return {
        consents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting user consents:", error);
      throw new Error("Failed to get user consents");
    }
  },

  getUserConsentDetails: async (user_id) => {
    try {
      const [consents] = await pool.query(
        `SELECT 
        uc.*,
        ld.type as document_type,
        ld.title as document_title,
        ld.version as document_version
       FROM user_consents uc
       JOIN legal_documents ld ON uc.document_id = ld.id
       WHERE uc.user_id = ?
       ORDER BY uc.consented_at DESC`,
        [user_id]
      );

      const [user] = await pool.query(
        `SELECT marketing_consent FROM users WHERE id = ?`,
        [user_id]
      );

      return {
        marketing_consent: user[0]?.marketing_consent || false,
        document_consents: consents,
      };
    } catch (error) {
      console.error("Error getting user consent details:", error);
      throw new Error("Failed to get user consent details");
    }
  },

  // Delete user permanently from database
deleteUser: async ({ user_id }) => {
  try {
    const connection = await pool.getConnection();
    
    await connection.beginTransaction();

    try {
      // Delete from wallets first (due to foreign key constraints)
      await connection.query(
        'DELETE FROM wallets WHERE user_id = UUID_TO_BIN(?)',
        [user_id]
      );

      // Delete from tickets
      await connection.query(
        'DELETE FROM tickets WHERE user_id = UUID_TO_BIN(?)',
        [user_id]
      );

      // Delete from purchases
      await connection.query(
        'DELETE FROM purchases WHERE user_id = UUID_TO_BIN(?)',
        [user_id]
      );

      // Finally delete user
      const [result] = await connection.query(
        'DELETE FROM users WHERE id = UUID_TO_BIN(?)',
        [user_id]
      );

      await connection.commit();
      
      return {
        message: 'User deleted permanently',
        affectedRows: result.affectedRows
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    throw new Error("Failed to delete user");
  }
},

// Soft delete user (mark as deleted using is_active = false)
softDeleteUser: async ({ user_id, reason }) => {
  try {
    const [result] = await pool.query(
      `UPDATE users 
       SET is_active = FALSE,
           deleted_at = NOW(),
           deletion_reason = ?
       WHERE id = UUID_TO_BIN(?)`,
      [reason || 'Administrative deletion', user_id]
    );

    return {
      message: 'User deactivated (soft deleted) successfully',
      affectedRows: result.affectedRows,
      is_active: false,
      deleted_at: new Date(),
      deletion_reason: reason
    };
  } catch (error) {
    console.error("Error soft deleting user:", error);
    throw new Error("Failed to deactivate user");
  }
},

// Suspend user (set is_active to false)
suspendUser: async ({ user_id, reason }) => {
  try {
    const [result] = await pool.query(
      `UPDATE users 
       SET is_active = FALSE,
           suspended_at = NOW(),
           suspension_reason = ?
       WHERE id = UUID_TO_BIN(?)`,
      [reason || 'Administrative suspension', user_id]
    );

    return {
      message: 'User suspended successfully',
      affectedRows: result.affectedRows,
      is_active: false,
      suspended_at: new Date(),
      suspension_reason: reason
    };
  } catch (error) {
    console.error("Error suspending user:", error);
    throw new Error("Failed to suspend user");
  }
},

// Activate/Unsuspend user (set is_active to true)
activateUser: async ({ user_id }) => {
  try {
    const [result] = await pool.query(
      `UPDATE users 
       SET is_active = TRUE,
           suspended_at = NULL,
           suspension_reason = NULL,
           deleted_at = NULL,
           deletion_reason = NULL
       WHERE id = UUID_TO_BIN(?)`,
      [user_id]
    );

    return {
      message: 'User activated successfully',
      affectedRows: result.affectedRows,
      is_active: true
    };
  } catch (error) {
    console.error("Error activating user:", error);
    throw new Error("Failed to activate user");
  }
}
};

export default AdminService;
