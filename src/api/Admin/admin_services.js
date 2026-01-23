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

updateUserStatus: async (user_id, status, reason, admin_id, ip_address = null, user_agent = null) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Convert status to MySQL boolean (1 for verified, 0 for not verified)
    const ageVerifiedValue = 1; // Default to verified
    
    console.log(`🔍 Updating user ${user_id}, status: ${status}, age_verified: ${ageVerifiedValue}`);

    // Update user age verification status
    const [updateResult] = await connection.query(
      `UPDATE users 
       SET age_verified = ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = UUID_TO_BIN(?)`,
      [ageVerifiedValue, user_id]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error("User not found");
    }

    // Log admin activity
    await connection.query(
      `INSERT INTO admin_activities (
        id, 
        admin_id, 
        action, 
         ip_address, 
        user_agent,
        created_at
       ) VALUES (
        UUID_TO_BIN(UUID()), 
        UUID_TO_BIN(?), 
        ?, 
        ?, 
        ?,
        CURRENT_TIMESTAMP
       )`,
      [
        admin_id,
        `USER_AGE_VERIFICATION_${status.toUpperCase()}`,
        ip_address || null,
        user_agent || null
      ]
    );

    await connection.commit();
    
    return { 
      success: true, 
      message: `User age verification status updated to ${status}`,
      data: {
        user_id: user_id,
        status: status,
        age_verified: ageVerifiedValue,
        updated_at: new Date().toISOString()
      }
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error updating user status:", error);
    throw new Error(`Failed to update user status: ${error.message}`);
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
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        BIN_TO_UUID(v.government_id_doc_id) as government_id_doc_id,
        BIN_TO_UUID(v.selfie_doc_id) as selfie_doc_id,
        v.additional_doc_ids,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        v.rejected_reason,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.created_at,
        v.updated_at,
        
        -- User info
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.kyc_status,
        u.kyc_submitted_at,
        u.kyc_verified_at,
        u.kyc_rejection_reason,
        BIN_TO_UUID(u.referred_by) as referred_by,
        u.referral_code,
        u.created_at as user_joined,
        
        -- Government ID document info
        gd.file_path as gov_doc_file_path,
        gd.file_name as gov_doc_file_name,
        gd.mime_type as gov_doc_mime_type,
        gd.status as gov_doc_status,
        
        -- Selfie document info
        sd.file_path as selfie_file_path,
        sd.file_name as selfie_file_name,
        sd.mime_type as selfie_mime_type,
        sd.status as selfie_status,
        
        -- Additional documents
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', BIN_TO_UUID(ad.id),
              'file_path', ad.file_path,
              'file_name', ad.file_name,
              'mime_type', ad.mime_type,
              'status', ad.status,
              'created_at', ad.created_at
            )
          )
          FROM kyc_documents ad
          WHERE ad.user_id = v.user_id 
          AND ad.document_type = 'additional_document'
          AND ad.status = 'pending'
        ) as additional_documents
        
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN kyc_documents gd ON v.government_id_doc_id = gd.id
      LEFT JOIN kyc_documents sd ON v.selfie_doc_id = sd.id
      WHERE v.status = 'PENDING'
      ORDER BY v.created_at ASC
      LIMIT ? OFFSET ?`,
      [parseInt(limit), offset]
    );

    const [total] = await pool.query(
      `SELECT COUNT(*) as total FROM verifications WHERE status = 'PENDING'`
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
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        BIN_TO_UUID(v.government_id_doc_id) as government_id_doc_id,
        BIN_TO_UUID(v.selfie_doc_id) as selfie_doc_id,
        v.additional_doc_ids,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        v.document_front_url,
        v.document_back_url,
        v.selfie_url,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        v.updated_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.profile_photo,
        u.created_at as user_joined,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
        
       FROM verifications v
       JOIN users u ON v.user_id = u.id
       LEFT JOIN users verifier ON v.verified_by = verifier.id
       WHERE v.user_id = UUID_TO_BIN(?)
       ORDER BY v.created_at DESC
       LIMIT 1`,
      [user_id]
    );

    if (verifications.length === 0) return null;

    // Get KYC documents
    const [documents] = await pool.query(
      `SELECT 
        BIN_TO_UUID(kd.id) as id,
        BIN_TO_UUID(kd.user_id) as user_id,
        kd.document_type,
        kd.file_path,
        kd.file_name,
        kd.mime_type,
        kd.file_size,
        kd.status,
        kd.created_at
       FROM kyc_documents kd
       WHERE kd.user_id = UUID_TO_BIN(?)
       ORDER BY kd.created_at DESC`,
      [user_id]
    );

    // Get KYC review history
    const [reviews] = await pool.query(
      `SELECT 
        BIN_TO_UUID(kr.id) as id,
        BIN_TO_UUID(kr.user_id) as user_id,
        BIN_TO_UUID(kr.admin_id) as admin_id,
        kr.old_status,
        kr.new_status,
        kr.review_notes,
        kr.reviewed_at,
        admin.email as admin_email,
        CONCAT(admin.first_name, ' ', admin.last_name) as admin_name
       FROM kyc_reviews kr
       LEFT JOIN users admin ON kr.admin_id = admin.id
       WHERE kr.user_id = UUID_TO_BIN(?)
       ORDER BY kr.reviewed_at DESC`,
      [user_id]
    );

    return {
      ...verifications[0],
      documents,
      reviews
    };
  } catch (error) {
    console.error("Error getting user verification:", error);
    throw new Error("Failed to get user verification");
  }
},

  // FIXED: updateVerificationStatus to use correct table and fields
updateVerificationStatus: async (
  user_id,
  status,
  rejection_reason,
  admin_id
) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Get current verification status first
    const [currentVerifications] = await connection.query(
      `SELECT status FROM verifications 
       WHERE user_id = UUID_TO_BIN(?)
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );

    if (currentVerifications.length === 0) {
      throw new Error("Verification not found for user");
    }

    const oldStatus = currentVerifications[0].status;

    // Update verification record in 'verifications' table
    // Using parameterized query with UUID_TO_BIN for verified_by
    await connection.query(
      `UPDATE verifications SET 
        status = ?,
        verified_by = UUID_TO_BIN(?),
        verified_at = NOW(),
        rejected_reason = ?
       WHERE user_id = UUID_TO_BIN(?)`,
      [
        status,
        admin_id,
        status === 'REJECTED' ? rejection_reason : null,
        user_id
      ]
    );

    // Also update user's kyc_status in users table
    let userKycStatus;
    if (status === 'APPROVED') {
      userKycStatus = 'verified';
    } else if (status === 'REJECTED') {
      userKycStatus = 'rejected';
    } else if (status === 'PENDING') {
      userKycStatus = 'under_review';
    } else {
      userKycStatus = status.toLowerCase();
    }

    await connection.query(
      `UPDATE users SET 
        kyc_status = ?,
        kyc_verified_at = CASE WHEN ? = 'APPROVED' THEN NOW() ELSE kyc_verified_at END,
        kyc_rejection_reason = CASE WHEN ? = 'REJECTED' THEN ? ELSE kyc_rejection_reason END,
        age_verified = CASE WHEN ? = 'APPROVED' THEN TRUE ELSE age_verified END
       WHERE id = UUID_TO_BIN(?)`,
      [
        userKycStatus,
        status,
        status,
        rejection_reason || null,
        status,
        user_id
      ]
    );

    // Record KYC review
    await connection.query(
      `INSERT INTO kyc_reviews (
        id, user_id, admin_id, old_status, new_status, review_notes, reviewed_at
      ) VALUES (
        UUID_TO_BIN(UUID()), 
        UUID_TO_BIN(?), 
        UUID_TO_BIN(?), 
        ?,
        ?,
        ?,
        NOW()
      )`,
      [user_id, admin_id, oldStatus, status, rejection_reason || '']
    );

    // Log admin activity
    try {
      await connection.query(
        `INSERT INTO admin_activities (
          id, admin_id, action, target_id, module, created_at
        ) VALUES (
          UUID_TO_BIN(UUID()), 
          UUID_TO_BIN(?), 
          ?, 
          ?, 
          'KYC',
          NOW()
        )`,
        [
          admin_id,
          `KYC_${status}`,
          user_id
        ]
      );
    } catch (logError) {
      console.log("Could not log admin activity:", logError.message);
      // Fallback to system_alerts
      await connection.query(
        `INSERT INTO system_alerts (
          id, type, title, message, source, created_at
        ) VALUES (
          UUID_TO_BIN(UUID()),
          'INFO',
          'KYC Status Updated',
          ?,
          'ADMIN',
          NOW()
        )`,
        [`Admin updated KYC status for user ${user_id} to ${status}`]
      );
    }

    await connection.commit();

    // If approved, update document statuses
    if (status === 'APPROVED') {
      try {
        await connection.query(
          `UPDATE kyc_documents SET status = 'approved' 
           WHERE user_id = UUID_TO_BIN(?)`,
          [user_id]
        );

        // Send notification to user
        const [userRows] = await pool.query(
          `SELECT email, username FROM users WHERE id = UUID_TO_BIN(?)`,
          [user_id]
        );
        
        if (userRows.length > 0) {
          const user = userRows[0];
          console.log(`KYC approved for user ${user.username} (${user.email})`);
          
          // Create notification for user
          await pool.query(
            `INSERT INTO system_alerts (
              id, type, title, message, source, created_at
            ) VALUES (
              UUID_TO_BIN(UUID()),
              'INFO',
              'KYC Approved',
              ?,
              'KYC',
              NOW()
            )`,
            [`Your KYC verification has been approved! You can now access all features.`]
          );
        }
      } catch (activationError) {
        console.error("Error in post-approval actions:", activationError);
      }
    } else if (status === 'REJECTED') {
      // Send rejection notification
      const [userRows] = await pool.query(
        `SELECT email, username FROM users WHERE id = UUID_TO_BIN(?)`,
        [user_id]
      );
      
      if (userRows.length > 0) {
        const user = userRows[0];
        console.log(`KYC rejected for user ${user.username} (${user.email})`);
        
        await pool.query(
          `INSERT INTO system_alerts (
            id, type, title, message, source, created_at
          ) VALUES (
            UUID_TO_BIN(UUID()),
            'WARNING',
            'KYC Rejected',
            ?,
            'KYC',
            NOW()
          )`,
          [`Your KYC verification was rejected. Reason: ${rejection_reason || 'No reason provided'}`]
        );
      }
    }

    // Get updated verification data
    const [updatedVerification] = await connection.query(
      `SELECT 
        BIN_TO_UUID(id) as verification_id,
        BIN_TO_UUID(user_id) as user_id,
        status,
        BIN_TO_UUID(verified_by) as verified_by,
        verified_at,
        rejected_reason
       FROM verifications 
       WHERE user_id = UUID_TO_BIN(?)
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );

    return {
      success: true,
      user_id,
      status,
      kyc_status: userKycStatus,
      verified_at: updatedVerification[0]?.verified_at || new Date(),
      verified_by: updatedVerification[0]?.verified_by || admin_id,
      verification: updatedVerification[0]
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error updating verification status:", error);
    throw new Error("Failed to update verification status: " + error.message);
  } finally {
    connection.release();
  }
},

  // FIXED: getAllVerifications to use correct table
 getAllVerifications: async ({ page, limit, status }) => {
  try {
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        -- Convert all BINARY(16) UUIDs to readable strings
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        BIN_TO_UUID(v.government_id_doc_id) as government_id_doc_id,
        BIN_TO_UUID(v.selfie_doc_id) as selfie_doc_id,
        v.additional_doc_ids,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        v.document_front_url,
        v.document_back_url,
        v.selfie_url,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        v.updated_at,
        
        -- User info
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        
        -- Verifier info
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
    `;

    let countQuery = `SELECT COUNT(*) as total FROM verifications v`;
    const params = [];
    const countParams = [];

    if (status) {
      query += ` WHERE v.status = ?`;
      countQuery += ` WHERE v.status = ?`;
      params.push(status);
      countParams.push(status);
    }

    query += ` ORDER BY v.created_at DESC LIMIT ? OFFSET ?`;
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

  // NEW: Get KYC dashboard statistics
 getKycDashboardStats: async () => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM verifications WHERE status = 'PENDING') as pending_review,
        (SELECT COUNT(*) FROM verifications WHERE status = 'APPROVED' AND DATE(verified_at) = CURDATE()) as approved_today,
        (SELECT COUNT(*) FROM verifications WHERE status = 'REJECTED' AND DATE(verified_at) = CURDATE()) as rejected_today,
        (SELECT COUNT(*) FROM verifications WHERE status = 'APPROVED') as total_verified,
        (SELECT COUNT(DISTINCT user_id) FROM verifications WHERE status = 'APPROVED') as unique_verified_users,
        (SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, verified_at)) FROM verifications WHERE status = 'APPROVED') as avg_verification_time_hours
      FROM DUAL
    `);

    // Get recent verification activity with UUID conversion
    const [recentActivity] = await pool.query(`
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.created_at,
        v.updated_at,
        
        u.username,
        u.email,
        u.profile_photo,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
      ORDER BY v.updated_at DESC
      LIMIT 5
    `);

    // Get verification trends (last 7 days)
    const [trends] = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_submitted,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
      FROM verifications
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    return {
      summary: stats[0],
      recent_activity: recentActivity,
      trends: trends
    };
  } catch (error) {
    console.error("Error getting KYC dashboard stats:", error);
    throw new Error("Failed to get KYC dashboard statistics");
  }
},

  // NEW: Bulk verification actions
bulkUpdateVerifications: async (userIds, status, adminId, rejectionReason = null) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Validate and prepare user IDs for query
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("User IDs array is required and cannot be empty");
    }

    // Create parameter placeholders and values
    const placeholders = userIds.map(() => 'UUID_TO_BIN(?)').join(', ');
    
    // Update verifications table
    await connection.query(`
      UPDATE verifications 
      SET status = ?, 
          verified_by = UUID_TO_BIN(?), 
          verified_at = NOW(),
          rejected_reason = ?
      WHERE user_id IN (${placeholders})
    `, [status, adminId, rejectionReason, ...userIds]);

    // Update users table
    let userKycStatus = 'pending';
    if (status === 'APPROVED') userKycStatus = 'verified';
    else if (status === 'REJECTED') userKycStatus = 'rejected';

    await connection.query(`
      UPDATE users 
      SET kyc_status = ?,
          kyc_verified_at = CASE WHEN ? = 'APPROVED' THEN NOW() ELSE NULL END,
          kyc_rejection_reason = CASE WHEN ? = 'REJECTED' THEN ? ELSE kyc_rejection_reason END,
          age_verified = CASE WHEN ? = 'APPROVED' THEN TRUE ELSE FALSE END
      WHERE id IN (${placeholders})
    `, [userKycStatus, status, status, rejectionReason, status, ...userIds]);

    // Create kyc_reviews for each user
    for (const userId of userIds) {
      // Get current status before update
      const [currentStatus] = await connection.query(
        `SELECT status FROM verifications WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );
      
      const oldStatus = currentStatus.length > 0 ? currentStatus[0].status : 'PENDING';
      
      // Map status for kyc_reviews table
      const statusMapping = {
        'APPROVED': 'verified',
        'REJECTED': 'rejected', 
        'PENDING': 'pending',
        'UNDER_REVIEW': 'under_review'
      };
      
      const mappedNewStatus = statusMapping[status] || status.toLowerCase();
      const mappedOldStatus = statusMapping[oldStatus] || oldStatus.toLowerCase();
      
      await connection.query(
        `INSERT INTO kyc_reviews (
          id, user_id, admin_id, old_status, new_status, review_notes, reviewed_at
        ) VALUES (
          UUID_TO_BIN(UUID()), 
          UUID_TO_BIN(?), 
          UUID_TO_BIN(?), 
          ?,
          ?,
          ?,
          NOW()
        )`,
        [userId, adminId, mappedOldStatus, mappedNewStatus, rejectionReason || '']
      );
    }

    // Log admin activity - use admin_activities table instead of admin_activity_logs
    await connection.query(
      `INSERT INTO admin_activities (
        id, admin_id, action, target_id, module, details, created_at
      ) VALUES (
        UUID_TO_BIN(UUID()),
        UUID_TO_BIN(?),
        ?,
        ?,
        'KYC',
        ?,
        NOW()
      )`,
      [
        adminId,
        'BULK_KYC_UPDATE',
        userIds[0], // Use first user ID as target
        JSON.stringify({
          count: userIds.length,
          status: status,
          rejection_reason: rejectionReason,
          user_ids: userIds
        })
      ]
    );

    await connection.commit();

    // Get updated verification count
    const [updatedCount] = await connection.query(
      `SELECT COUNT(*) as count FROM verifications 
       WHERE user_id IN (${placeholders}) AND status = ?`,
      [...userIds, status]
    );

    return {
      success: true,
      message: `Updated ${userIds.length} verifications to ${status}`,
      count: updatedCount[0].count || userIds.length,
      updated_ids: userIds
    };
  } catch (error) {
    await connection.rollback();
    console.error("Error in bulk update:", error);
    throw new Error("Failed to update verifications: " + error.message);
  } finally {
    connection.release();
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
      // Delete from referral_links first (due to foreign key constraints)
      await connection.query(
        'DELETE FROM referral_links WHERE user_id = UUID_TO_BIN(?)',
        [user_id]
      );

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
           deleted_at = NULL
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
},

// Export all Users
exportAllUsers: async ({ search, role, status }) => {
  try {
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

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
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
    }

    // No pagination for export
    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting all users:", error);
    throw new Error("Failed to export all users");
  }
},

// Export all Active Users
exportAllActiveUsers: async ({ search, role, status }) => {
  try {
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
      WHERE u.is_active = TRUE
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting active users:", error);
    throw new Error("Failed to export active users");
  }
},

// Export all Pending Users (unverified)
exportAllPendingUsers: async ({ search, role }) => {
  try {
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
      WHERE u.age_verified = FALSE
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting pending users:", error);
    throw new Error("Failed to export pending users");
  }
},

// Export all Suspended Users (inactive)
exportAllSuspendedUsers: async ({ search, role, status }) => {
  try {
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
      WHERE u.is_active = FALSE
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting suspended users:", error);
    throw new Error("Failed to export suspended users");
  }
},

// Export by Date Range
exportByDateRange: async ({ startDate, endDate, search, role, status }) => {
  try {
    if (!startDate || !endDate) {
      throw new Error("Start date and end date are required");
    }

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
      WHERE DATE(u.created_at) BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting users by date range:", error);
    throw new Error("Failed to export users by date range");
  }
},

// Export all Tier 1 Users
exportAllTier1Users: async ({ search, role, status }) => {
  try {
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
        ON u.id = wcr.user_id AND wc.type = 'CREDIT'
      LEFT JOIN user_subscriptions us 
        ON u.id = us.user_id 
        AND us.status = 'ACTIVE' 
        AND us.end_date >= CURDATE()
      LEFT JOIN subscription_tiers st 
        ON us.tier_id = st.id
      WHERE st.tier_level = 1
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting tier 1 users:", error);
    throw new Error("Failed to export tier 1 users");
  }
},

// Export all Tier 2 Users
exportAllTier2Users: async ({ search, role, status }) => {
  try {
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
        ON u.id = wcr.user_id AND wc.type = 'CREDIT'
      LEFT JOIN user_subscriptions us 
        ON u.id = us.user_id 
        AND us.status = 'ACTIVE' 
        AND us.end_date >= CURDATE()
      LEFT JOIN subscription_tiers st 
        ON us.tier_id = st.id
      WHERE st.tier_level = 2
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting tier 2 users:", error);
    throw new Error("Failed to export tier 2 users");
  }
},

// Export all Tier 3 Users
exportAllTier3Users: async ({ search, role, status }) => {
  try {
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
        ON u.id = wcr.user_id AND wc.type = 'CREDIT'
      LEFT JOIN user_subscriptions us 
        ON u.id = us.user_id 
        AND us.status = 'ACTIVE' 
        AND us.end_date >= CURDATE()
      LEFT JOIN subscription_tiers st 
        ON us.tier_id = st.id
      WHERE st.tier_level = 3
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
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

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting tier 3 users:", error);
    throw new Error("Failed to export tier 3 users");
  }
},

// Export all Free Users (users without active subscription)
exportAllFreeUsers: async ({ search, role, status }) => {
  try {
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
        NULL AS tier_name,
        NULL AS tier_level,
        NULL AS badge_name,
        NULL AS monthly_price,
        NULL AS benefits,
        NULL AS subscription_status,
        NULL AS subscription_start,
        NULL AS subscription_end,
        NULL AS auto_renew,
        NULL AS next_payment_date,
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
        ON u.id = wcr.user_id AND wc.type = 'CREDIT'
      WHERE u.id NOT IN (
        SELECT DISTINCT us.user_id 
        FROM user_subscriptions us
        WHERE us.status = 'ACTIVE' 
          AND us.end_date >= CURDATE()
      )
    `;

    const params = [];
    const conditions = [];

    // Search
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Role
    if (role) {
      conditions.push(`u.role = ?`);
      params.push(role);
    }

    // Verification status
    if (status === "verified") {
      conditions.push(`u.age_verified = TRUE`);
    } else if (status === "unverified") {
      conditions.push(`u.age_verified = FALSE`);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [users] = await pool.query(query, params);

    // Format users
    const formattedUsers = users.map(user => ({
      ...user,
      subscription: null
    }));

    return formattedUsers;
  } catch (error) {
    console.error("Error exporting free users:", error);
    throw new Error("Failed to export free users");
  }
},

// Export with detailed information including all data from getUserDetails
exportDetailedUsers: async ({ limit = 100, search, role, status }) => {
  try {
    // First get basic user info
    const basicUsers = await getAllUsers({
      page: 1,
      limit: parseInt(limit),
      search,
      role,
      status
    });

    // Then enrich each user with detailed information
    const detailedUsers = await Promise.all(
      basicUsers.users.map(async (user) => {
        try {
          const details = await getUserDetails(user.id);
          return {
            ...user,
            details
          };
        } catch (error) {
          console.error(`Error fetching details for user ${user.id}:`, error);
          return user; // Return basic user info if details fail
        }
      })
    );

    return detailedUsers;
  } catch (error) {
    console.error("Error exporting detailed users:", error);
    throw new Error("Failed to export detailed users");
  }
},
// Export all KYC
exportAllKYC: async ({ search, status, documentType }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        BIN_TO_UUID(v.government_id_doc_id) as government_id_doc_id,
        BIN_TO_UUID(v.selfie_doc_id) as selfie_doc_id,
        v.additional_doc_ids,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        v.document_front_url,
        v.document_back_url,
        v.selfie_url,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        v.updated_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.profile_photo,
        u.created_at as user_joined,
        u.phone,
        u.country,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Status filter
    if (status) {
      conditions.push(`v.status = ?`);
      params.push(status);
    }

    // Document type filter
    if (documentType) {
      conditions.push(`v.document_type = ?`);
      params.push(documentType);
    }

    // Apply WHERE clause
    if (conditions.length > 0) {
      const whereClause = ` WHERE ${conditions.join(" AND ")}`;
      query += whereClause;
    }

    query += ` ORDER BY v.created_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting all KYC:", error);
    throw new Error("Failed to export all KYC");
  }
},

// Export all Pending KYC
exportAllPendingKYC: async ({ search, documentType }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        v.created_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.created_at as user_joined,
        u.phone,
        u.country
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      WHERE v.status = 'PENDING'
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Document type filter
    if (documentType) {
      conditions.push(`v.document_type = ?`);
      params.push(documentType);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting pending KYC:", error);
    throw new Error("Failed to export pending KYC");
  }
},

// Export all Approved KYC
exportAllApprovedKYC: async ({ search, documentType }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.created_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.created_at as user_joined,
        u.phone,
        u.country,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
      WHERE v.status = 'APPROVED'
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Document type filter
    if (documentType) {
      conditions.push(`v.document_type = ?`);
      params.push(documentType);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY v.verified_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting approved KYC:", error);
    throw new Error("Failed to export approved KYC");
  }
},

// Export all Rejected KYC
exportAllRejectedKYC: async ({ search, documentType }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.created_at as user_joined,
        u.phone,
        u.country,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
      WHERE v.status = 'REJECTED'
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Document type filter
    if (documentType) {
      conditions.push(`v.document_type = ?`);
      params.push(documentType);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY v.verified_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting rejected KYC:", error);
    throw new Error("Failed to export rejected KYC");
  }
},

// Export by document type: Driver's License
exportDriversLicenseKYC: async ({ search, status }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.created_at as user_joined,
        u.phone,
        u.country,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
      WHERE v.document_type = 'DRIVERS_LICENSE'
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Status filter
    if (status) {
      conditions.push(`v.status = ?`);
      params.push(status);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting driver's license KYC:", error);
    throw new Error("Failed to export driver's license KYC");
  }
},

// Export by document type: Passport
exportPassportKYC: async ({ search, status }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.created_at as user_joined,
        u.phone,
        u.country,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
      WHERE v.document_type = 'PASSPORT'
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Status filter
    if (status) {
      conditions.push(`v.status = ?`);
      params.push(status);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting passport KYC:", error);
    throw new Error("Failed to export passport KYC");
  }
},

// Export by document type: National ID
exportNationalIdKYC: async ({ search, status }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(v.id) as verification_id,
        BIN_TO_UUID(v.user_id) as user_id,
        v.status,
        v.verification_type,
        v.document_type,
        v.document_number,
        v.first_name,
        v.last_name,
        v.date_of_birth,
        v.government_id_type,
        v.government_id_number,
        BIN_TO_UUID(v.verified_by) as verified_by,
        v.verified_at,
        v.rejected_reason,
        v.created_at,
        
        u.username,
        u.email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.date_of_birth as user_date_of_birth,
        u.created_at as user_joined,
        u.phone,
        u.country,
        
        verifier.email as verified_by_email,
        CONCAT(verifier.first_name, ' ', verifier.last_name) as verified_by_name
      FROM verifications v
      JOIN users u ON v.user_id = u.id
      LEFT JOIN users verifier ON v.verified_by = verifier.id
      WHERE v.document_type = 'NATIONAL_ID'
    `;

    const params = [];
    const conditions = [];

    // Search by username or email
    if (search) {
      conditions.push(`(u.username LIKE ? OR u.email LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }

    // Status filter
    if (status) {
      conditions.push(`v.status = ?`);
      params.push(status);
    }

    // Apply WHERE clause additional conditions
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY v.created_at DESC`;

    const [verifications] = await pool.query(query, params);

    return verifications;
  } catch (error) {
    console.error("Error exporting national ID KYC:", error);
    throw new Error("Failed to export national ID KYC");
  }
},

// Export detailed KYC with documents and reviews
exportDetailedKYC: async ({ limit = 100, search, status, documentType }) => {
  try {
    // Get verifications
    const verifications = await exportAllKYC({ search, status, documentType });
    
    // Limit results
    const limitedVerifications = verifications.slice(0, parseInt(limit));

    // Fetch documents and reviews for each verification
    const detailedVerifications = await Promise.all(
      limitedVerifications.map(async (verification) => {
        try {
          // Get documents for this user
          const [documents] = await pool.query(
            `SELECT 
              BIN_TO_UUID(kd.id) as id,
              BIN_TO_UUID(kd.user_id) as user_id,
              kd.document_type,
              kd.file_path,
              kd.file_name,
              kd.mime_type,
              kd.file_size,
              kd.status,
              kd.created_at
             FROM kyc_documents kd
             WHERE kd.user_id = UUID_TO_BIN(?)
             ORDER BY kd.created_at DESC`,
            [verification.user_id]
          );

          // Get review history for this user
          const [reviews] = await pool.query(
            `SELECT 
              BIN_TO_UUID(kr.id) as id,
              BIN_TO_UUID(kr.user_id) as user_id,
              BIN_TO_UUID(kr.admin_id) as admin_id,
              kr.old_status,
              kr.new_status,
              kr.review_notes,
              kr.reviewed_at,
              admin.email as admin_email,
              CONCAT(admin.first_name, ' ', admin.last_name) as admin_name
             FROM kyc_reviews kr
             LEFT JOIN users admin ON kr.admin_id = admin.id
             WHERE kr.user_id = UUID_TO_BIN(?)
             ORDER BY kr.reviewed_at DESC`,
            [verification.user_id]
          );

          return {
            ...verification,
            documents,
            reviews
          };
        } catch (error) {
          console.error(`Error fetching details for KYC ${verification.verification_id}:`, error);
          return verification; // Return basic verification if details fail
        }
      })
    );

    return detailedVerifications;
  } catch (error) {
    console.error("Error exporting detailed KYC:", error);
    throw new Error("Failed to export detailed KYC");
  }
},
// Export all Admins
exportAllAdmins: async ({ search, status }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(u.id) AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.last_login,
        u.permissions,

        BIN_TO_UUID(u.created_by) AS created_by_id,
        creator.email AS created_by_email,
        creator.first_name AS created_by_first_name,
        creator.last_name AS created_by_last_name,

        (SELECT COUNT(*) 
           FROM admin_activities a 
           WHERE a.admin_id = u.id
        ) AS activity_count,

        (SELECT COUNT(*) 
           FROM admin_activities a 
           WHERE a.admin_id = u.id 
           AND DATE(a.created_at) = CURDATE()
        ) AS todays_activities

      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      WHERE u.role = 'ADMIN'
    `;

    const params = [];
    const conditions = [];

    // Status filter
    if (status === "active") {
      conditions.push(`u.is_active = TRUE`);
    } else if (status === "inactive") {
      conditions.push(`u.is_active = FALSE`);
    }

    // Search by email or name
    if (search) {
      conditions.push(`(u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    // Apply WHERE clause
    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }

    query += ` ORDER BY u.created_at DESC`;

    const [admins] = await pool.query(query, params);

    // Parse permissions JSON
    const formattedAdmins = admins.map(admin => {
      let permissions = {};
      try {
        if (admin.permissions) {
          permissions = typeof admin.permissions === 'string' 
            ? JSON.parse(admin.permissions) 
            : admin.permissions;
        }
      } catch (error) {
        console.error('Error parsing permissions:', error);
      }

      return {
        ...admin,
        permissions: permissions
      };
    });

    return formattedAdmins;
  } catch (error) {
    console.error("Error exporting all admins:", error);
    throw new Error("Failed to export all admins");
  }
},

// Export all Active Admins
exportAllActiveAdmins: async ({ search }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(u.id) AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.last_login,
        u.permissions,

        BIN_TO_UUID(u.created_by) AS created_by_id,
        creator.email AS created_by_email,
        creator.first_name AS created_by_first_name,
        creator.last_name AS created_by_last_name,

        (SELECT COUNT(*) 
           FROM admin_activity_logs a 
           WHERE a.admin_id = u.id
        ) AS activity_count,

        (SELECT COUNT(*) 
           FROM admin_activity_logs a 
           WHERE a.admin_id = u.id 
           AND DATE(a.created_at) = CURDATE()
        ) AS todays_activities

      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      WHERE u.role = 'ADMIN'
        AND u.is_active = TRUE
    `;

    const params = [];
    
    // Search by email or name
    if (search) {
      query += ` AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY u.created_at DESC`;

    const [admins] = await pool.query(query, params);

    // Parse permissions JSON
    const formattedAdmins = admins.map(admin => {
      let permissions = {};
      try {
        if (admin.permissions) {
          permissions = typeof admin.permissions === 'string' 
            ? JSON.parse(admin.permissions) 
            : admin.permissions;
        }
      } catch (error) {
        console.error('Error parsing permissions:', error);
      }

      return {
        ...admin,
        permissions: permissions
      };
    });

    return formattedAdmins;
  } catch (error) {
    console.error("Error exporting active admins:", error);
    throw new Error("Failed to export active admins");
  }
},

// Export all Inactive Admins
exportAllInactiveAdmins: async ({ search }) => {
  try {
    let query = `
      SELECT 
        BIN_TO_UUID(u.id) AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.last_login,
        u.permissions,

        BIN_TO_UUID(u.created_by) AS created_by_id,
        creator.email AS created_by_email,
        creator.first_name AS created_by_first_name,
        creator.last_name AS created_by_last_name,

        (SELECT COUNT(*) 
           FROM admin_activity_logs a 
           WHERE a.admin_id = u.id
        ) AS activity_count,

        (SELECT created_at
           FROM admin_activity_logs a 
           WHERE a.admin_id = u.id
           ORDER BY created_at DESC
           LIMIT 1
        ) AS last_activity

      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      WHERE u.role = 'ADMIN'
        AND u.is_active = FALSE
    `;

    const params = [];
    
    // Search by email or name
    if (search) {
      query += ` AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    query += ` ORDER BY u.created_at DESC`;

    const [admins] = await pool.query(query, params);

    // Parse permissions JSON
    const formattedAdmins = admins.map(admin => {
      let permissions = {};
      try {
        if (admin.permissions) {
          permissions = typeof admin.permissions === 'string' 
            ? JSON.parse(admin.permissions) 
            : admin.permissions;
        }
      } catch (error) {
        console.error('Error parsing permissions:', error);
      }

      return {
        ...admin,
        permissions: permissions
      };
    });

    return formattedAdmins;
  } catch (error) {
    console.error("Error exporting inactive admins:", error);
    throw new Error("Failed to export inactive admins");
  }
},

// Export detailed admins with activity stats
exportDetailedAdmins: async ({ limit = 100, search, status }) => {
  try {
    // Get admins
    const admins = await exportAllAdmins({ search, status });
    
    // Limit results
    const limitedAdmins = admins.slice(0, parseInt(limit));

    // Fetch detailed stats for each admin
    const detailedAdmins = await Promise.all(
      limitedAdmins.map(async (admin) => {
        try {
          // Get admin activity stats
          const [stats] = await pool.query(
            `SELECT 
               COUNT(*) AS total_activities,
               SUM(action = 'CREATE_COMPETITION') AS competitions_created,
               SUM(action = 'SELECT_WINNER') AS winners_selected,
               SUM(action = 'EDIT_USER') AS users_edited,
               SUM(action = 'KYC_APPROVED') AS kyc_approved,
               SUM(action = 'KYC_REJECTED') AS kyc_rejected,
               MAX(created_at) AS last_activity,
               MIN(created_at) AS first_activity
             FROM admin_activity_logs
             WHERE admin_id = UUID_TO_BIN(?)`,
            [admin.id]
          );

          // Get recent activities (last 10)
          const [activities] = await pool.query(
            `SELECT 
               action,
               entity_type,
               details,
               created_at
             FROM admin_activity_logs
             WHERE admin_id = UUID_TO_BIN(?)
             ORDER BY created_at DESC
             LIMIT 10`,
            [admin.id]
          );

          // Get admin role permissions if separate table exists
          let roleInfo = {};
          try {
            const [role] = await pool.query(
              `SELECT 
                 name as role_name,
                 description,
                 level,
                 created_at
               FROM admin_roles
               WHERE id = (
                 SELECT role_id FROM admin_user_roles 
                 WHERE user_id = UUID_TO_BIN(?) 
                 LIMIT 1
               )`,
              [admin.id]
            );
            if (role.length > 0) {
              roleInfo = role[0];
            }
          } catch (roleError) {
            console.log('Role table may not exist:', roleError.message);
          }

          return {
            ...admin,
            stats: stats[0] || {},
            recent_activities: activities,
            role_info: roleInfo
          };
        } catch (error) {
          console.error(`Error fetching details for admin ${admin.id}:`, error);
          return admin; // Return basic admin if details fail
        }
      })
    );

    return detailedAdmins;
  } catch (error) {
    console.error("Error exporting detailed admins:", error);
    throw new Error("Failed to export detailed admins");
  }
},

};

export default AdminService;
