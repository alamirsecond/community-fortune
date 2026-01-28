import bcrypt from "bcryptjs";
import crypto from "crypto";
import pool from "../../../database.js";
import {
  CreateAdminSchema,
  UpdateAdminSchema,
  PaginationSchema,
  ActivityLogQuerySchema,
} from "./superAdminValidator.js";
import { sendAdminCreationEmail } from "../../Utils/emailService.js";
import SystemAlertService from "./SystemAlertService.js";



// Helper function to format time ago
// Helper function to create revenue transaction records
const createRevenueTransaction = async (transactionData) => {
  try {
    const {
      userId,
      type,
      amount,
      status = 'completed',
      description,
      referenceTable,
      referenceId,
      metadata = {},
      gateway = null,
      fee = 0.00,
      ipAddress = null
    } = transactionData;

    const transactionId = uuidv4();
    
    await pool.query(
      `INSERT INTO transactions (
        id, user_id, type, amount, currency, status, description,
        reference_table, reference_id, metadata, gateway, fee,
        net_amount, ip_address, created_at
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'GBP', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        transactionId,
        userId,
        type,
        amount,
        status,
        description,
        referenceTable,
        referenceId,
        JSON.stringify(metadata),
        gateway,
        fee,
        amount - fee,
        ipAddress
      ]
    );
    
    // Update daily revenue summary
    const today = new Date().toISOString().split('T')[0];
    
    await pool.query(
      `INSERT INTO revenue_summary (id, date, total_revenue, transaction_count, updated_at)
       VALUES (UUID_TO_BIN(?), ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE
       total_revenue = total_revenue + ?,
       transaction_count = transaction_count + 1,
       updated_at = NOW()`,
      [uuidv4(), today, amount, amount]
    );
    
    return transactionId;
  } catch (error) {
    console.error('Error creating revenue transaction:', error);
    // Don't throw, just log
  }
};
const superAdminController = {
  // Create new admin
  createAdmin: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      //Validate request
      const parsed = CreateAdminSchema.safeParse(req.body);
      if (!parsed.success) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsed.error.errors,
        });
      }
    const { email, first_name, last_name, username, phone, permissions } = parsed.data;
      const superadminId = req.user.id;
      // console.log(superadminId);
      // Check if user already exists
      const [existingUsers] = await connection.query(
        `SELECT id FROM users WHERE email = ?`,
        [email]
      );
      if (existingUsers.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "User with this email already exists",
        });
      }
      //Generate random password
      const tempPassword = crypto.randomBytes(8).toString("hex") + "A1!";
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(tempPassword, salt);
      //Generate username if not provided
      const adminUsername = username || email.split("@")[0] + "_admin";
      // Default permissions
      const defaultPermissions = {
        manage_competitions: true,
        manage_users: false,
        view_analytics: true,
        manage_winners: true,
        manage_content: false,
        manage_settings: false,
      };
      // Create admin user
      await connection.query(
        `INSERT INTO users (
        id, email, username, password_hash, first_name, last_name, phone,
        role, is_active, created_by, permissions, email_verified, created_at
      ) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, 'ADMIN', TRUE, UUID_TO_BIN(?), ?, TRUE, NOW())`,
        [
          email,
          adminUsername,
          hashedPassword,
          first_name,
          last_name,
          phone || null,
          superadminId,
          JSON.stringify(permissions || defaultPermissions),
        ]
      );
      //Get the new admin ID as BINARY(16)
      const [newAdmin] = await connection.query(
        `SELECT id FROM users WHERE email = ?`,
        [email]
      );

      const newAdminId = newAdmin[0].id; 

      //Log admin creation activity
   await connection.query(
  `INSERT INTO admin_activities (
    id,
    admin_id,
    action,
    target_id,
    module,
    ip_address,
    user_agent
  ) VALUES (
    UUID_TO_BIN(UUID()),
    UUID_TO_BIN(?),
    ?,
    ?,
    ?,
    ?,
    ?
  )`,
  [
    superadminId,          // admin_id
    "CREATE_ADMIN",        // action
    newAdminId.toString("hex"), // target_id (created admin)
    "USER",                // module
    req.ip,
    req.headers["user-agent"]
  ]
);

      // Send welcome email with password
      await sendAdminCreationEmail({
        to: email,
        subject: "Welcome to Community Fortune Admin Panel",
        name: first_name,
        email,
        password: tempPassword,
        loginUrl: `${process.env.FRONTEND_URL}/admin/login`,
      });
      await connection.commit();
      res.status(201).json({
        success: true,
        message: "Admin created successfully. Login credentials sent to email.",
        data: {
          admin_id: newAdminId.toString("hex"), // optional: convert binary to string for FE
          email,
          first_name,
          last_name,
          permissions: permissions || defaultPermissions,
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Create admin error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to create admin",
      });
    } finally {
      connection.release();
    }
  },
  //Get all admins
// Get all admins
getAdmins: async (req, res) => {
  try {
    const parsed = PaginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: parsed.error.errors,
      });
    }
    
    const {
      page = 1,
      limit = 20,
      search = "",
      status = "active",
    } = parsed.data;
    
    const offset = (page - 1) * limit;
    let whereClause = "WHERE u.role IN ('ADMIN', 'SUPERADMIN')";
    const queryParams = [];
    
    if (status === "active") {
      whereClause += " AND u.is_active = TRUE";
    } else if (status === "inactive") {
      whereClause += " AND u.is_active = FALSE";
    }
    
    if (search) {
      whereClause +=
        " AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.username LIKE ?)";
      const searchParam = `%${search}%`;
      queryParams.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    // Main query for admins
    const [admins] = await pool.query(
      `SELECT 
        BIN_TO_UUID(u.id)            AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login,
        u.permissions,
        BIN_TO_UUID(u.created_by)    AS created_by_id,
        creator.email               AS created_by_email,
        creator.first_name          AS created_by_first_name,
        creator.last_name           AS created_by_last_name,
        (
          SELECT COUNT(*) 
          FROM admin_activities aa 
          WHERE aa.admin_id = u.id
        ) AS activity_count
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      ${whereClause}
      ORDER BY 
        CASE u.role 
          WHEN 'SUPERADMIN' THEN 1 
          WHEN 'ADMIN' THEN 2 
          ELSE 3 
        END,
        u.created_at DESC
      LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), offset]
    );

    // Total count
    const countWhereClause = whereClause.replace(/u\./g, '');
    const [totalResult] = await pool.query(
      `SELECT COUNT(*) as total FROM users ${countWhereClause}`,
      queryParams
    );
    
    res.status(200).json({
      success: true,
      data: {
        admins,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit),
        },
      },
    });
  } catch (err) {
    console.error("Get admins error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch admins",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
},
// Get admin dashboard statistics
getAdminStats: async (req, res) => {
  try {
    const [totalAdmins] = await pool.query(
      `SELECT COUNT(*) as total 
       FROM users 
       WHERE role IN ('ADMIN', 'SUPERADMIN')`
    );

    // Count admins created this month
    const [monthlyAdmins] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE role IN ('ADMIN', 'SUPERADMIN') 
       AND MONTH(created_at) = MONTH(CURRENT_DATE()) 
       AND YEAR(created_at) = YEAR(CURRENT_DATE())`
    );

    // Count active admins (assuming active = logged in last 24 hours)
    const [activeAdmins] = await pool.query(
      `SELECT COUNT(*) as active 
       FROM users 
       WHERE role IN ('ADMIN', 'SUPERADMIN') 
       AND is_active = TRUE 
       AND last_login >= DATE_SUB(NOW(), INTERVAL 1 DAY)`
    );

 
    // If you don't have invitations table, you can track pending in users table
    // Alternative query:
    const [pendingInvitations] = await pool.query(
      `SELECT COUNT(*) as pending 
       FROM users 
       WHERE role IN ('ADMIN', 'SUPERADMIN') 
       AND email_verified = FALSE 
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
    );

    const total = totalAdmins[0]?.total || 0;
    const thisMonth = monthlyAdmins[0]?.count || 0;
    const active = activeAdmins[0]?.active || 0;
    const pending = pendingInvitations[0]?.pending || 0;
    const onlineRate = total > 0 ? Math.round((active / total) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        total,
        thisMonth,
        active,
        pending,
        onlineRate,
        stats: {
          totalAdmins: {
            value: total,
            change: thisMonth > 0 ? `+${thisMonth} this month` : 'No new admins this month',
            trend: thisMonth > 0 ? 'up' : 'neutral'
          },
          activeAdmins: {
            value: active,
            percentage: onlineRate,
            change: `${onlineRate}% online rate`
          },
          pendingInvitations: {
            value: pending,
            change: pending > 0 ? `${pending} pending` : 'No pending invites'
          }
        }
      }
    });
  } catch (err) {
    console.error("Get admin stats error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch admin statistics"
    });
  }
},
//Get single admin by ID
// Get single admin by ID
getAdmin: async (req, res) => {
  try {
    const { admin_id } = req.params;
    
    // Get admin details
    const [admins] = await pool.query(
      `SELECT 
        BIN_TO_UUID(u.id)         AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.role,
        u.is_active,
        u.created_at,
        u.last_login,
        u.permissions,
        BIN_TO_UUID(u.created_by) AS created_by_id,
        creator.email            AS created_by_email,
        creator.username         AS created_by_username,
        creator.first_name       AS created_by_first_name,
        creator.last_name        AS created_by_last_name
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      WHERE u.id = UUID_TO_BIN(?) 
        AND u.role IN ('ADMIN', 'SUPERADMIN')`,
      [admin_id]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }

    const admin = admins[0];

    // Admin activity stats (matching new table schema)
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) AS total_activities,
        SUM(CASE 
          WHEN module = 'competitions' THEN 1 
          ELSE 0 
        END) AS competitions_activities,
        SUM(CASE 
          WHEN module = 'users' THEN 1 
          ELSE 0 
        END) AS users_activities,
        SUM(CASE 
          WHEN module = 'vouchers' THEN 1 
          ELSE 0 
        END) AS vouchers_activities,
        DATE(MAX(created_at)) AS last_activity_date
      FROM admin_activities
      WHERE admin_id = UUID_TO_BIN(?)`,
      [admin_id]
    );

    // Recent activities (last 10)
    const [activities] = await pool.query(
      `SELECT 
        BIN_TO_UUID(id) as activity_id,
        action,
        module,
        target_id,
        ip_address,
        created_at
      FROM admin_activities
      WHERE admin_id = UUID_TO_BIN(?)
      ORDER BY created_at DESC
      LIMIT 10`,
      [admin_id]
    );

    // Monthly activity count (last 6 months)
    const [monthlyStats] = await pool.query(
      `SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as activity_count
      FROM admin_activities
      WHERE admin_id = UUID_TO_BIN(?)
        AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC`,
      [admin_id]
    );

    res.status(200).json({
      success: true,
      data: {
        admin: admin,
        stats: {
          total_activities: stats[0]?.total_activities || 0,
          competitions_activities: stats[0]?.competitions_activities || 0,
          users_activities: stats[0]?.users_activities || 0,
          vouchers_activities: stats[0]?.vouchers_activities || 0,
          last_activity_date: stats[0]?.last_activity_date || null
        },
        recent_activities: activities,
        monthly_activity: monthlyStats,
      },
    });
  } catch (err) {
    console.error("Get admin error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch admin details",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
},

updateAdmin: async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { admin_id } = req.params; 
    const superadminId = req.user.id;
    const userIp = req.ip;
    const userAgent = req.headers["user-agent"] || null;

    const parsed = UpdateAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { is_active, permissions, role } = parsed.data;

    // Check admin exists - FIXED QUERY
    const [existingAdmins] = await connection.query(
      `SELECT 
        BIN_TO_UUID(id) AS admin_uuid, 
        email,
        username,
        is_active,
        permissions,
        role
      FROM users
      WHERE id = UUID_TO_BIN(?) AND role IN ('ADMIN', 'SUPERADMIN')`,
      [admin_id]
    );

    if (existingAdmins.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }

    const existingAdmin = existingAdmins[0];

    // Check permission to update role (only SUPERADMIN can change roles)
    if (role && req.user.role !== 'SUPERADMIN') {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        error: "Only SUPERADMIN can change admin roles",
      });
    }

    // Check if trying to demote last SUPERADMIN
    if (role === 'ADMIN' && existingAdmin.role === 'SUPERADMIN') {
      const [superadminCount] = await connection.query(
        `SELECT COUNT(*) as count 
        FROM users 
        WHERE role = 'SUPERADMIN' AND is_active = TRUE`
      );
      
      if (superadminCount[0].count <= 1) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Cannot demote the last active SUPERADMIN",
        });
      }
    }

    // Build update query
    const updates = [];
    const updateParams = [];
    
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      updateParams.push(is_active);
    }
    
    if (permissions !== undefined) {
      updates.push("permissions = ?");
      updateParams.push(JSON.stringify(permissions));
    }
    
    if (role !== undefined) {
      updates.push("role = ?");
      updateParams.push(role);
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    
    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    updateParams.push(admin_id);

    // Update the admin
    const [updateResult] = await connection.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = UUID_TO_BIN(?)`,
      updateParams
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "No changes were made to the admin",
      });
    }

    // Log activity
    await connection.query(
      `INSERT INTO admin_activities (
        id, 
        admin_id, 
        action, 
        target_id,
        module,
        ip_address, 
        user_agent,
        created_at
      ) VALUES (
        UUID_TO_BIN(UUID()),
        UUID_TO_BIN(?),
        ?,
        ?,
        ?,
        ?,
        ?,
        CURRENT_TIMESTAMP
      )`,
      [
        superadminId,       
        "ADMIN_UPDATED",
        admin_id,
        "admin_management",
        userIp,
        userAgent
      ]
    );

    // Get updated admin data
    const [updatedAdmin] = await connection.query(
      `SELECT 
        BIN_TO_UUID(id) as id,
        email,
        username,
        first_name,
        last_name,
        role,
        is_active,
        permissions,
        created_at,
        updated_at
      FROM users
      WHERE id = UUID_TO_BIN(?)`,
      [admin_id]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin[0]
    });
  } catch (err) {
    await connection.rollback();
    console.error("Update admin error:", err);
    
    // Log full error for debugging
    console.error("Full error details:", {
      message: err.message,
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      sqlMessage: err.sqlMessage,
      sql: err.sql
    });
    
    // Handle specific errors
    if (err.code === 'ER_PARSE_ERROR') {
      return res.status(400).json({
        success: false,
        error: "SQL syntax error",
        details: process.env.NODE_ENV === 'development' ? err.sqlMessage : undefined
      });
    }
    
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({
        success: false,
        error: "Admin not found or invalid ID",
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Failed to update admin",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      sqlError: process.env.NODE_ENV === 'development' ? err.sqlMessage : undefined
    });
  } finally {
    connection.release();
  }
},


  //aklilu:Reset admin password
resetAdminPassword: async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
  //  console.log(req.ip);
    const { admin_id } = req.params; 
    const superadminId = req.user.id;
    //aklilu:Check if admin exists 
    const [admins] = await connection.query(
      `SELECT BIN_TO_UUID(id) as id, email, first_name 
       FROM users 
       WHERE id = UUID_TO_BIN(?) AND role = 'ADMIN'`,
      [admin_id]
    );
    if (admins.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }
    const admin = admins[0];
    //aklilu:Generate new random password
    const newPassword = crypto.randomBytes(8).toString("hex") + "A1!";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    //aklilu:Update password
    await connection.query(
      `UPDATE users SET 
         password_hash = ?, 
         password_reset_token = NULL, 
         password_reset_expires = NULL,
         login_attempts = 0,
         account_locked_until = NULL
       WHERE id = UUID_TO_BIN(?)`,
      [hashedPassword, admin_id]
    );
    //aklilu:Log password reset activity
    await connection.query(
      `INSERT INTO admin_activity_logs (
         id, admin_id, action, entity_type, entity_id, ip_address, user_agent, details
       ) VALUES (
         UUID_TO_BIN(UUID()), 
         UUID_TO_BIN(?), 
         ?, ?, 
         UUID_TO_BIN(?), 
         ?, ?, ?
       )`,
      [
        superadminId,
        "RESET_ADMIN_PASSWORD",
        "user",
        admin_id,
        req.ip,
        req.headers["user-agent"],
        JSON.stringify({
          admin_id: admin.id,
          admin_email: admin.email,
          reset_by: superadminId,
        }),
      ]
    );
    // Send email with new password
    await sendAdminCreationEmail({
      to: admin.email,
      subject: "Password Reset - Community Fortune Admin Panel",
      name: admin.first_name,
      email: admin.email,
      password: newPassword,
      loginUrl: `${process.env.FRONTEND_URL}/admin/login`,
      isReset: true,
    });
    await connection.commit();
    res.status(200).json({
      success: true,
      message: "Admin password reset successful. New password sent to email.",
      data: {
        admin_id: admin.id,
        email: admin.email,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("Reset admin password error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to reset admin password",
    });
  } finally {
    connection.release();
  }
},
//aklilu:Get activity logs
//aklilu:Get activity logs
getActivityLogs: async (req, res) => {
  try {
    const parsed = ActivityLogQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "Invalid query parameters",
        details: parsed.error.errors,
      });
    }
    const {
      page = 1,
      limit = 50,
      admin_id,
      action,
      start_date,
      end_date,
      module, // Added module filter if needed
    } = parsed.data;
    const offset = (page - 1) * limit;
    
    let whereClause = "WHERE 1=1";
    const queryParams = [];
    
    //aklilu:UUID → BIN for filtering
    if (admin_id) {
      whereClause += " AND a.admin_id = UUID_TO_BIN(?)";
      queryParams.push(admin_id);
    }
    if (action) {
      whereClause += " AND a.action = ?";
      queryParams.push(action);
    }
    if (module) {
      whereClause += " AND a.module = ?";
      queryParams.push(module);
    }
    if (start_date) {
      whereClause += " AND DATE(a.created_at) >= ?";
      queryParams.push(start_date);
    }
    if (end_date) {
      whereClause += " AND DATE(a.created_at) <= ?";
      queryParams.push(end_date);
    }
    
    // Clone query params for total count query (without LIMIT/OFFSET)
    const countParams = [...queryParams];
    
    // Add LIMIT and OFFSET for main query
    queryParams.push(parseInt(limit), offset);
    
    //aklilu:Fetch logs with UUIDs instead of BINs
    const [logs] = await pool.query(
      `SELECT 
          BIN_TO_UUID(a.id) AS id,
          BIN_TO_UUID(a.admin_id) AS admin_id,
          a.action,
          a.target_id,
          a.module,
          a.ip_address,
          a.user_agent,
          a.created_at,
          a.updated_at,
          u.email AS admin_email,
          u.first_name AS admin_first_name,
          u.last_name AS admin_last_name,
          u.role AS admin_role
       FROM admin_activities a
       LEFT JOIN users u ON a.admin_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    //aklilu:Total count (same filters, no LIMIT/OFFSET)
    const [totalResult] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM admin_activities a
       LEFT JOIN users u ON a.admin_id = u.id
       ${whereClause}`,
      countParams
    );
    
    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit),
        },
      },
    });
  } catch (err) {
    console.error("Get activity logs error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch activity logs",
    });
  }
},

//aklilu:Get superadmin dashboard stats
getDashboardStats: async (req, res) => {
  try {
    // Get time ranges
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

    // Execute all queries in parallel for performance
    const [
      totalStats,
      adminStats,
      revenueStats,
      purchasesRevenue,
      creditPurchasesRevenue,
      subscriptionsRevenue,
      withdrawalsStats,
      referralRevenue,
      dailyRevenue,
      recentAdminActivities,
      recentUserActivities,
      activityByModule,
      topActiveUsers
    ] = await Promise.all([
      // Total stats query (from your existing query)
      pool.query(
        `SELECT 
           (SELECT COUNT(*) FROM users WHERE role = 'ADMIN' AND is_active = TRUE) as active_admins,
           (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') as total_admins,
           (SELECT COUNT(*) FROM users WHERE role = 'USER' AND is_active = TRUE) as active_users,
           (SELECT COUNT(*) FROM users WHERE role = 'USER' AND kyc_status = 'pending') as Pending_KYC_status,
           (SELECT COUNT(*) FROM users WHERE role = 'USER') as total_users,
           (SELECT COUNT(*) FROM competitions WHERE status = 'ACTIVE') as active_competitions,
           (SELECT COUNT(*) FROM competitions WHERE created_at >= ?) as recent_competitions
         FROM dual`,
        [thirtyDaysAgo]
      ),
      
      // Admin stats query (from your existing query)
      pool.query(
        `SELECT 
           COUNT(DISTINCT admin_id) as active_admins_30d,
           COUNT(*) as total_activities_30d,
           MAX(created_at) as last_activity
         FROM admin_activities
         WHERE created_at >= ?`,
        [thirtyDaysAgo]
      ),
      
      // General revenue stats from transactions table (if exists)
      pool.query(`
        SELECT 
          -- All time totals from transactions table
          COALESCE(SUM(CASE 
            WHEN type IN ('deposit', 'commission', 'fee', 'purchase', 'subscription', 'competition_entry') THEN amount
            WHEN type IN ('withdrawal', 'instant_win', 'referral_payout') THEN -amount
            ELSE 0
          END), 0) as total_revenue_all_time,
          
          -- This month
          COALESCE(SUM(CASE 
            WHEN type IN ('deposit', 'commission', 'fee', 'purchase', 'subscription', 'competition_entry') THEN amount
            WHEN type IN ('withdrawal', 'instant_win', 'referral_payout') THEN -amount
            ELSE 0
          END), 0) as total_revenue_this_month,
          
          -- Today
          COALESCE(SUM(CASE 
            WHEN type IN ('deposit', 'commission', 'fee', 'purchase', 'subscription', 'competition_entry') THEN amount
            WHEN type IN ('withdrawal', 'instant_win', 'referral_payout') THEN -amount
            ELSE 0
          END), 0) as total_revenue_today,
          
          -- Yesterday
          COALESCE(SUM(CASE 
            WHEN type IN ('deposit', 'commission', 'fee', 'purchase', 'subscription', 'competition_entry') THEN amount
            WHEN type IN ('withdrawal', 'instant_win', 'referral_payout') THEN -amount
            ELSE 0
          END), 0) as total_revenue_yesterday,
          
          -- Transaction counts
          COUNT(*) as total_transactions,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END), 0) as avg_transaction_value
        FROM transactions 
        WHERE 1=1`,
        [] // No parameters since we're checking table existence
      ).catch(() => ({ [0]: [{
        total_revenue_all_time: 0,
        total_revenue_this_month: 0,
        total_revenue_today: 0,
        total_revenue_yesterday: 0,
        total_transactions: 0,
        pending_count: 0,
        avg_transaction_value: 0
      }] })),
      
      // Revenue from purchases table (competition entries)
      pool.query(
        `SELECT 
           COALESCE(SUM(total_amount), 0) as total_purchase_revenue,
           COALESCE(SUM(CASE WHEN created_at >= ? THEN total_amount ELSE 0 END), 0) as recent_purchase_revenue,
           COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) as today_purchase_revenue,
           COUNT(*) as total_purchases,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_purchases,
           COALESCE(AVG(total_amount), 0) as avg_purchase_value
         FROM purchases 
         WHERE status IN ('PAID', 'PENDING')`,
        [thirtyDaysAgo]
      ),
      
      // Revenue from credit purchases (deposits)
      pool.query(
        `SELECT 
           COALESCE(SUM(amount), 0) as total_deposit_revenue,
           COALESCE(SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END), 0) as recent_deposit_revenue,
           COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount ELSE 0 END), 0) as today_deposit_revenue,
           COUNT(*) as total_deposits,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_deposits,
           COALESCE(AVG(amount), 0) as avg_deposit_value
         FROM credit_purchases 
         WHERE status IN ('COMPLETED', 'PENDING')`,
        [thirtyDaysAgo]
      ),
      
      // Subscription revenue
      pool.query(
        `SELECT 
           COALESCE(SUM(st.monthly_price), 0) as total_subscription_revenue,
           COUNT(DISTINCT us.user_id) as active_subscribers,
           COUNT(*) as total_subscriptions
         FROM user_subscriptions us
         JOIN subscription_tiers st ON us.tier_id = st.id
         WHERE us.status = 'ACTIVE' 
           AND us.end_date >= CURDATE()`
      ),
      
      // Withdrawals (outgoing)
      pool.query(
        `SELECT 
           COALESCE(SUM(amount), 0) as total_withdrawals_requested,
           COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0) as total_withdrawals_paid,
           COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) as pending_withdrawals,
           COUNT(*) as total_withdrawal_requests,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_withdrawal_count
         FROM withdrawals`
      ),
      
      // Referral revenue (payouts)
      pool.query(
        `SELECT 
           COALESCE(SUM(amount), 0) as total_referral_payouts,
           COUNT(*) as total_referral_events
         FROM referral_events 
         WHERE event_type = 'REWARD_PAID' 
           AND status = 'COMPLETED'`
      ),
      
      // Daily revenue breakdown (for chart)
      pool.query(
        `SELECT 
           DATE(p.created_at) as date,
           COALESCE(SUM(p.total_amount), 0) as purchase_revenue,
           COALESCE(SUM(cp.amount), 0) as deposit_revenue,
           COALESCE(SUM(w.amount), 0) as withdrawal_amount
         FROM (
           SELECT created_at, total_amount FROM purchases WHERE status IN ('PAID', 'PENDING') AND created_at >= ?
           UNION ALL
           SELECT NULL as created_at, 0 as total_amount WHERE 1=0
         ) p
         LEFT JOIN (
           SELECT DATE(created_at) as cp_date, SUM(amount) as amount 
           FROM credit_purchases 
           WHERE status IN ('COMPLETED', 'PENDING') AND created_at >= ?
           GROUP BY DATE(created_at)
         ) cp ON DATE(p.created_at) = cp.cp_date
         LEFT JOIN (
           SELECT DATE(requested_at) as w_date, SUM(amount) as amount 
           FROM withdrawals 
           WHERE status IN ('COMPLETED', 'PENDING') AND requested_at >= ?
           GROUP BY DATE(requested_at)
         ) w ON DATE(p.created_at) = w.w_date
         WHERE p.created_at IS NOT NULL
         GROUP BY DATE(p.created_at)
         ORDER BY date DESC
         LIMIT 7`,
        [sevenDaysAgo, sevenDaysAgo, sevenDaysAgo]
      ),
      
      // Recent admin activities (from your existing query)
      pool.query(
        `SELECT 
           BIN_TO_UUID(a.id) AS id,
           BIN_TO_UUID(a.admin_id) AS admin_id,
           a.action,
           a.ip_address,
           a.user_agent,
           a.created_at,
           u.email AS admin_email,
           u.username AS admin_username
         FROM admin_activities a
         LEFT JOIN users u ON a.admin_id = u.id
         ORDER BY a.created_at DESC
         LIMIT 5`
      ),
      
      // Recent user activities (from your existing query)
      pool.query(
        `SELECT 
           BIN_TO_UUID(ua.id) AS id,
           BIN_TO_UUID(ua.user_id) AS user_id,
           ua.action,
           ua.module,
           ua.target_id,
           ua.ip_address,
           ua.user_agent,
           ua.details,
           ua.created_at,
           u.email AS user_email,
           u.username AS user_username,
           u.first_name AS user_first_name,
           u.last_name AS user_last_name
         FROM user_activities ua
         LEFT JOIN users u ON ua.user_id = u.id
         ORDER BY ua.created_at DESC
         LIMIT 5`
      ),
      
      // Activity by module (from your existing query)
      pool.query(
        `SELECT 
           module,
           COUNT(*) as activity_count
         FROM user_activities 
         WHERE created_at >= ?
         GROUP BY module
         ORDER BY activity_count DESC`,
        [thirtyDaysAgo]
      ),
      
      // Top active users (from your existing query)
      pool.query(
        `SELECT 
           BIN_TO_UUID(u.id) as user_id,
           u.username,
           u.email,
           COUNT(ua.id) as activity_count,
           MAX(ua.created_at) as last_activity
         FROM users u
         LEFT JOIN user_activities ua ON u.id = ua.user_id
         WHERE u.role = 'USER'
           AND ua.created_at >= ?
         GROUP BY u.id, u.username, u.email
         ORDER BY activity_count DESC
         LIMIT 5`,
        [thirtyDaysAgo]
      )
    ]);

    // Parse the results
    const stats = totalStats[0][0];
    const adminActivityStats = adminStats[0][0];
    const generalRevenue = revenueStats[0][0] || {};
    const purchaseRevenue = purchasesRevenue[0][0];
    const creditPurchaseRevenue = creditPurchasesRevenue[0][0];
    const subscriptionRevenue = subscriptionsRevenue[0][0];
    const withdrawals = withdrawalsStats[0][0];
    const referralPayouts = referralRevenue[0][0];
    const dailyRevenueData = dailyRevenue[0];

    // Calculate total revenue from all sources
    const calculateTotalRevenue = () => {
      let total = 0;
      
      // From general transactions table
      total += parseFloat(generalRevenue.total_revenue_all_time || 0);
      
      // If no transactions table, calculate from other tables
      if (total === 0) {
        // Purchase revenue (competition entries)
        total += parseFloat(purchaseRevenue.total_purchase_revenue || 0);
        
        // Credit purchases (deposits)
        total += parseFloat(creditPurchaseRevenue.total_deposit_revenue || 0);
        
        // Subtract withdrawals
        total -= parseFloat(withdrawals.total_withdrawals_paid || 0);
        
        // Subtract referral payouts
        total -= parseFloat(referralPayouts.total_referral_payouts || 0);
      }
      
      return total;
    };

    const calculateThisMonthRevenue = () => {
      let total = 0;
      
      // From general transactions table
      total += parseFloat(generalRevenue.total_revenue_this_month || 0);
      
      // If no transactions table, calculate from other tables
      if (total === 0) {
        total += parseFloat(purchaseRevenue.recent_purchase_revenue || 0);
        total += parseFloat(creditPurchaseRevenue.recent_deposit_revenue || 0);
      }
      
      return total;
    };

    const calculateTodayRevenue = () => {
      let total = 0;
      
      // From general transactions table
      total += parseFloat(generalRevenue.total_revenue_today || 0);
      
      // If no transactions table, calculate from other tables
      if (total === 0) {
        total += parseFloat(purchaseRevenue.today_purchase_revenue || 0);
        total += parseFloat(creditPurchaseRevenue.today_deposit_revenue || 0);
      }
      
      return total;
    };

    const totalRevenueAllTime = calculateTotalRevenue();
    const totalRevenueThisMonth = calculateThisMonthRevenue();
    const totalRevenueToday = calculateTodayRevenue();
    const totalRevenueYesterday = parseFloat(generalRevenue.total_revenue_yesterday || 0);

    // Calculate growth percentages
    const calculateMonthOverMonthGrowth = async () => {
      try {
        const [lastMonthRevenue] = await pool.query(
          `SELECT 
             COALESCE(SUM(p.total_amount), 0) as purchase_revenue,
             COALESCE(SUM(cp.amount), 0) as deposit_revenue
           FROM purchases p
           LEFT JOIN credit_purchases cp ON DATE(p.created_at) = DATE(cp.created_at)
           WHERE DATE(p.created_at) >= ? AND DATE(p.created_at) < ?`,
          [lastMonthStart, thisMonthStart]
        );
        
        const lastMonthTotal = parseFloat(lastMonthRevenue[0]?.purchase_revenue || 0) + 
                              parseFloat(lastMonthRevenue[0]?.deposit_revenue || 0);
        
        if (lastMonthTotal > 0) {
          return ((totalRevenueThisMonth - lastMonthTotal) / lastMonthTotal * 100).toFixed(2);
        }
        return totalRevenueThisMonth > 0 ? "100.00" : "0.00";
      } catch (error) {
        console.error("Error calculating MoM growth:", error);
        return "0.00";
      }
    };

    const momGrowth = await calculateMonthOverMonthGrowth();
    const dodGrowth = totalRevenueYesterday > 0 
      ? ((totalRevenueToday - totalRevenueYesterday) / totalRevenueYesterday * 100).toFixed(2)
      : totalRevenueToday > 0 ? "100.00" : "0.00";

    // Parse JSON details for activities
    const parseActivityDetails = (activities) => {
      return activities.map(activity => {
        try {
          if (activity.details) {
            activity.details = typeof activity.details === 'string' 
              ? JSON.parse(activity.details) 
              : activity.details;
          }
          return activity;
        } catch (error) {
          console.error('Error parsing activity details:', error);
          activity.details = {};
          return activity;
        }
      });
    };

    const adminActivitiesParsed = parseActivityDetails(recentAdminActivities[0]);
    const userActivitiesParsed = parseActivityDetails(recentUserActivities[0]);

    // Format dates for better readability
    const formatTimeAgo = (dateString) => {
      const date = new Date(dateString);
      const now = new Date();
      const seconds = Math.floor((now - date) / 1000);
      
      let interval = Math.floor(seconds / 31536000);
      if (interval >= 1) return interval + " year" + (interval === 1 ? "" : "s") + " ago";
      interval = Math.floor(seconds / 2592000);
      if (interval >= 1) return interval + " month" + (interval === 1 ? "" : "s") + " ago";
      interval = Math.floor(seconds / 86400);
      if (interval >= 1) return interval + " day" + (interval === 1 ? "" : "s") + " ago";
      interval = Math.floor(seconds / 3600);
      if (interval >= 1) return interval + " hour" + (interval === 1 ? "" : "s") + " ago";
      interval = Math.floor(seconds / 60);
      if (interval >= 1) return interval + " minute" + (interval === 1 ? "" : "s") + " ago";
      return Math.floor(seconds) + " second" + (seconds === 1 ? "" : "s") + " ago";
    };

    const formatActivityDates = (activities) => {
      return activities.map(activity => {
        return {
          ...activity,
          time_ago: formatTimeAgo(activity.created_at),
          formatted_date: new Date(activity.created_at).toLocaleString()
        };
      });
    };

    const formattedAdminActivities = formatActivityDates(adminActivitiesParsed);
    const formattedUserActivities = formatActivityDates(userActivitiesParsed);

    // Format currency
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount || 0);
    };

    res.status(200).json({
      success: true,
      data: {
        summary: {
          users: {
            total: stats.total_users,
            active: stats.active_users,
            pending_kyc: stats.Pending_KYC_status,
            total_admins: stats.total_admins,
            active_admins: stats.active_admins
          },
          competitions: {
            active: stats.active_competitions,
            recent: stats.recent_competitions
          },
          admin_activities: {
            ...adminActivityStats
          }
        },
        revenue: {
          overview: {
            total: {
              value: totalRevenueAllTime,
              formatted: formatCurrency(totalRevenueAllTime)
            },
            this_month: {
              value: totalRevenueThisMonth,
              formatted: formatCurrency(totalRevenueThisMonth),
              growth: parseFloat(momGrowth)
            },
            today: {
              value: totalRevenueToday,
              formatted: formatCurrency(totalRevenueToday),
              growth: parseFloat(dodGrowth)
            },
            yesterday: {
              value: totalRevenueYesterday,
              formatted: formatCurrency(totalRevenueYesterday)
            }
          },
          breakdown: {
            purchases: {
              total: purchaseRevenue.total_purchase_revenue,
              formatted: formatCurrency(purchaseRevenue.total_purchase_revenue),
              count: purchaseRevenue.total_purchases,
              pending: purchaseRevenue.pending_purchases,
              average: formatCurrency(purchaseRevenue.avg_purchase_value)
            },
            deposits: {
              total: creditPurchaseRevenue.total_deposit_revenue,
              formatted: formatCurrency(creditPurchaseRevenue.total_deposit_revenue),
              count: creditPurchaseRevenue.total_deposits,
              pending: creditPurchaseRevenue.pending_deposits,
              average: formatCurrency(creditPurchaseRevenue.avg_deposit_value)
            },
            subscriptions: {
              total: subscriptionRevenue.total_subscription_revenue,
              formatted: formatCurrency(subscriptionRevenue.total_subscription_revenue),
              active_users: subscriptionRevenue.active_subscribers,
              count: subscriptionRevenue.total_subscriptions
            },
            withdrawals: {
              requested: withdrawals.total_withdrawals_requested,
              formatted: formatCurrency(withdrawals.total_withdrawals_requested),
              paid: withdrawals.total_withdrawals_paid,
              pending: withdrawals.pending_withdrawals,
              count: withdrawals.total_withdrawal_requests
            },
            referral_payouts: {
              total: referralPayouts.total_referral_payouts,
              formatted: formatCurrency(referralPayouts.total_referral_payouts),
              count: referralPayouts.total_referral_events
            }
          },
          metrics: {
            net_revenue: formatCurrency(totalRevenueAllTime - withdrawals.total_withdrawals_paid),
            average_daily_revenue: formatCurrency(totalRevenueThisMonth / new Date().getDate()),
            conversion_rate: purchaseRevenue.total_purchases > 0 && creditPurchaseRevenue.total_deposits > 0 
              ? ((purchaseRevenue.total_purchases / creditPurchaseRevenue.total_deposits) * 100).toFixed(2) + '%'
              : '0%'
          },
          daily_trend: dailyRevenueData
        },
        recent_activities: {
          admin: formattedAdminActivities,
          user: formattedUserActivities
        },
        analytics: {
          by_module: activityByModule[0],
          top_active_users: topActiveUsers[0]
        }
      }
    });
  } catch (err) {
    console.error("Get dashboard stats error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch dashboard stats",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
},
   getAlerts:async(req, res)=> {
    try {
      const alerts = await SystemAlertService.getRecentAlerts(5);
      res.json({ success: true, data: alerts });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
  dismissAlert:async(req, res)=> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          success: false,
          error: "Alert ID is required",
        });
      }
      const dismissed = await SystemAlertService.dismissAlert(id);
      if (!dismissed) {
        return res.status(404).json({
          success: false,
          error: "Alert not found",
        });
      }

      res.json({ success: true, message: "Alert dismissed" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },


  
};

export default superAdminController;
