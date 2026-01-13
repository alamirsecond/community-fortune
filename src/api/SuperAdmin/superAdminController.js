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
        `INSERT INTO admin_activity_logs (
        id, admin_id, action, entity_type, entity_id, ip_address, user_agent, details
      ) VALUES (
        UUID_TO_BIN(UUID()), 
        UUID_TO_BIN(?), 
        ?, ?, 
        ?, 
        ?, ?, ?
      )`,
        [
          superadminId,
          "CREATE_ADMIN",
          "user",
          newAdminId,
          req.ip,
          req.headers["user-agent"],
          JSON.stringify({
            admin_email: email,
            created_by: superadminId,
            permissions: permissions || defaultPermissions,
          }),
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
    let whereClause = "WHERE u.role = 'ADMIN'";
    const queryParams = [];
    if (status === "active") {
      whereClause += " AND u.is_active = TRUE";
    } else if (status === "inactive") {
      whereClause += " AND u.is_active = FALSE";
    }
    if (search) {
      whereClause +=
        " AND (u.email LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)";
      const searchParam = `%${search}%`;
      queryParams.push(searchParam, searchParam, searchParam);
    }
    queryParams.push(parseInt(limit), offset);
    //Fetch admins (convert BIN → UUID in SELECT)
    const [admins] = await pool.query(
      `SELECT 
        BIN_TO_UUID(u.id)            AS id,
        u.email,
        u.username,
        u.first_name,
        u.last_name,
        u.phone,
        u.is_active,
        u.created_at,
        u.last_login,
        u.permissions,

        BIN_TO_UUID(u.created_by)    AS created_by_id,
        creator.email               AS created_by_email,
        creator.first_name          AS created_by_first_name,
        creator.last_name           AS created_by_last_name,

        (SELECT COUNT(*) 
           FROM admin_activity_logs a 
           WHERE a.admin_id = u.id
        ) AS activity_count

      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?`,
      queryParams
    );

    //Total count (no BIN_TO_UUID needed)
    const [totalResult] = await pool.query(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      queryParams.slice(0, queryParams.length - 2)
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
    });
  }
},
//Get single admin by ID
getAdmin: async (req, res) => {
  try {
    const { admin_id } = req.params;
    const [admins] = await pool.query(
      `SELECT 
         BIN_TO_UUID(u.id)         AS id,
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
         creator.email            AS created_by_email,
         creator.first_name       AS created_by_first_name,
         creator.last_name        AS created_by_last_name

       FROM users u
       LEFT JOIN users creator ON u.created_by = creator.id
       WHERE u.id = UUID_TO_BIN(?) 
         AND u.role = 'ADMIN'`,
      [admin_id]
    );

    if (admins.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }

    //Admin activity stats
    const [stats] = await pool.query(
      `SELECT 
         COUNT(*) AS total_activities,
         SUM(action = 'CREATE_COMPETITION') AS competitions_created,
         SUM(action = 'SELECT_WINNER')      AS winners_selected,
         MAX(created_at)                    AS last_activity
       FROM admin_activity_logs
       WHERE admin_id = UUID_TO_BIN(?)`,
      [admin_id]
    );

    //Recent activities 
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
      [admin_id]
    );

    res.status(200).json({
      success: true,
      data: {
        admin: admins[0],
        stats: stats[0],
        recent_activities: activities,
      },
    });
  } catch (err) {
    console.error("Get admin error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch admin details",
    });
  }
},

  // Update admin
 updateAdmin: async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { admin_id } = req.params; 
    const superadminId = req.user.id;

    const parsed = UpdateAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: parsed.error.errors,
      });
    }

    const { is_active, permissions } = parsed.data;

    //Check admin exists
    const [existingAdmins] = await connection.query(
      `SELECT BIN_TO_UUID(id) AS id, email
       FROM users
       WHERE id = UUID_TO_BIN(?) AND role = 'ADMIN'`,
      [admin_id]
    );

    if (existingAdmins.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Admin not found",
      });
    }

    //Build update query
    const updates = [];
    const updateParams = [];
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      updateParams.push(is_active);
    }
    if (permissions) {
      updates.push("permissions = ?");
      updateParams.push(JSON.stringify(permissions));
    }
    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: "No fields to update",
      });
    }

    //UUID → BIN for WHERE
    updateParams.push(admin_id);

    await connection.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = UUID_TO_BIN(?)`,
      updateParams
    );

    //Log update activity (ALL UUIDs converted properly)
    await connection.query(
      `INSERT INTO admin_activity_logs (
        id, admin_id, action, entity_type, entity_id,
        ip_address, user_agent, details
      ) VALUES (
        UUID_TO_BIN(UUID()),
        UUID_TO_BIN(?),
        ?,
        ?,
        UUID_TO_BIN(?),
        ?,
        ?,
        ?
      )`,
      [
        superadminId,       
        "UPDATE_ADMIN",
        "user",
        admin_id,    
        req.ip,
        req.headers["user-agent"],
        JSON.stringify({
          admin_id,
          updates: {
            is_active,
            permissions,
          },
        }),
      ]
    );

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Admin updated successfully",
    });
  } catch (err) {
    await connection.rollback();
    console.error("Update admin error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to update admin",
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
    if (start_date) {
      whereClause += " AND a.created_at >= ?";
      queryParams.push(start_date);
    }
    if (end_date) {
      whereClause += " AND a.created_at <= ?";
      queryParams.push(end_date);
    }
    queryParams.push(parseInt(limit), offset);
    //aklilu:Fetch logs with UUIDs instead of BINs
    const [logs] = await pool.query(
      `SELECT 
          BIN_TO_UUID(a.id) AS id,
          BIN_TO_UUID(a.admin_id) AS admin_id,
          a.action,
          a.entity_type,
          BIN_TO_UUID(a.entity_id) AS entity_id,
          a.ip_address,
          a.user_agent,
          a.details,
          a.created_at,
          u.email AS sup_admin_email,
          u.first_name AS admin_first_name,
          u.last_name AS admin_last_name
       FROM admin_activity_logs a
       JOIN users u ON a.admin_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      queryParams
    );

    //aklilu:Total count (same filters, no LIMIT/OFFSET)
    const [totalResult] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM admin_activity_logs a
       JOIN users u ON a.admin_id = u.id
       ${whereClause}`,
      queryParams.slice(0, queryParams.length - 2)
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
      // Get stats from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [totalStats] = await pool.query(
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
      );
      // Get admin activity stats
      const [adminStats] = await pool.query(
        `SELECT 
           COUNT(DISTINCT admin_id) as active_admins_30d,
           COUNT(*) as total_activities_30d,
           MAX(created_at) as last_activity
         FROM admin_activity_logs 
         WHERE created_at >= ?`,
        [thirtyDaysAgo]
      );
      const [recentActivities] = await pool.query(
            `SELECT 
            BIN_TO_UUID(a.id)        AS id,
            BIN_TO_UUID(a.admin_id) AS Sup_admin_id,
            BIN_TO_UUID(a.entity_id) AS entity_id,
            a.action,
            a.entity_type,
            a.ip_address,
            a.user_agent,
            a.details,
            a.created_at,
            u.email AS sup_admin_email
            FROM admin_activity_logs a
            JOIN users u ON a.admin_id = u.id
            ORDER BY a.created_at DESC
            LIMIT 5`
      );
      res.status(200).json({
        success: true,
        data: {
          stats: {
            ...totalStats[0],
            ...adminStats[0],
          },
          recent_activities: recentActivities,
        },
      });
    } catch (err) {
      console.error("Get dashboard stats error:", err);
      res.status(500).json({
        success: false,
        error: "Failed to fetch dashboard stats",
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
  }
};

export default superAdminController;
