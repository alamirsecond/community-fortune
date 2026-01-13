import pool from "../../../database.js";

export const PartnersService = {
  submitApplication: async (applicationData) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const {
        name,
        email,
        phone,
        social_links,
        audience_size,
        platform,
        content_examples,
        proposal,
      } = applicationData;

      // Check for duplicate applications (same email in last 30 days)
      const [existingApps] = await connection.query(
        `SELECT id FROM partner_applications 
         WHERE email = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [email]
      );

      if (existingApps.length > 0) {
        throw new Error(
          "You have already submitted an application recently. Please wait 30 days before applying again."
        );
      }

      // Insert application
      const [result] = await connection.query(
        `INSERT INTO partner_applications 
         (id, name, email, phone, social_links, audience_size, platform, content_examples, proposal, status) 
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          name,
          email,
          phone,
          JSON.stringify(social_links),
          audience_size,
          platform,
          content_examples,
          proposal,
        ]
      );

      await connection.commit();

      return { id: result.insertId };
    } catch (error) {
      await connection.rollback();
      console.error("Error submitting application:", error);
      throw error;
    } finally {
      connection.release();
    }
  },

  getApplications: async ({ page, limit, status, platform }) => {
    try {
      const offset = (page - 1) * limit;
      let query = `
        SELECT 
          pa.*,
          u.username as assigned_admin_name
        FROM partner_applications pa
        LEFT JOIN users u ON pa.assigned_admin_id = u.id
      `;

      let countQuery = `SELECT COUNT(*) as total FROM partner_applications pa`;
      const params = [];
      const countParams = [];

      // Build WHERE conditions
      const conditions = [];
      if (status) {
        conditions.push(`pa.status = ?`);
        params.push(status);
        countParams.push(status);
      }
      if (platform) {
        conditions.push(`pa.platform = ?`);
        params.push(platform);
        countParams.push(platform);
      }

      if (conditions.length > 0) {
        const whereClause = ` WHERE ${conditions.join(" AND ")}`;
        query += whereClause;
        countQuery += whereClause;
      }

      query += ` ORDER BY pa.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const [applications] = await pool.query(query, params);
      const [totalResult] = await pool.query(countQuery, countParams);

      return {
        applications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalResult[0].total,
          pages: Math.ceil(totalResult[0].total / limit),
        },
      };
    } catch (error) {
      console.error("Error getting applications:", error);
      throw new Error("Failed to get applications");
    }
  },

  getApplication: async (id) => {
    try {
      const [applications] = await pool.query(
        `SELECT 
          pa.*,
          u.username as assigned_admin_name,
          u.email as assigned_admin_email
         FROM partner_applications pa
         LEFT JOIN users u ON pa.assigned_admin_id = u.id
         WHERE pa.id = ?`,
        [id]
      );

      if (applications.length === 0) return null;

      // Get application history (status changes, notes, etc.)
      const [history] = await pool.query(
        `SELECT aa.*, u.username as admin_name 
         FROM admin_activities aa 
         JOIN users u ON aa.admin_id = u.id 
         WHERE aa.resource_type = 'PARTNER_APPLICATION' AND aa.resource_id = ? 
         ORDER BY aa.created_at DESC`,
        [id]
      );

      return {
        ...applications[0],
        history,
      };
    } catch (error) {
      console.error("Error getting application:", error);
      throw new Error("Failed to get application");
    }
  },

  updateApplicationStatus: async (id, status, admin_notes, admin_id) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updateData = { status };
      if (status === "APPROVED") {
        updateData.approved_at = new Date();
        updateData.approved_by = admin_id;
      } else if (status === "REJECTED") {
        updateData.rejected_at = new Date();
      }

      if (admin_notes) {
        updateData.admin_notes = admin_notes;
      }

      await connection.query(`UPDATE partner_applications SET ? WHERE id = ?`, [
        updateData,
        id,
      ]);

      // Log admin activity
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, resource_type, resource_id, ip_address)
         VALUES (UUID(), ?, ?, 'PARTNER_APPLICATION', ?, ?)`,
        [admin_id, `Updated application status to ${status}`, id, "127.0.0.1"] // Use actual IP in production
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Error updating application status:", error);
      throw new Error("Failed to update application status");
    } finally {
      connection.release();
    }
  },

  assignApplication: async (id, admin_id, assigned_by) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE partner_applications SET assigned_admin_id = ? WHERE id = ?`,
        [admin_id, id]
      );

      // Log assignment
      await connection.query(
        `INSERT INTO admin_activities (id, admin_id, action, resource_type, resource_id, ip_address)
         VALUES (UUID(), ?, ?, 'PARTNER_APPLICATION', ?, ?)`,
        [
          assigned_by,
          `Assigned application to admin ${admin_id}`,
          id,
          "127.0.0.1",
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Error assigning application:", error);
      throw new Error("Failed to assign application");
    } finally {
      connection.release();
    }
  },

  getPartnershipAnalytics: async (period) => {
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

      // Applications over time
      const [applicationsOverTime] = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as count 
         FROM partner_applications 
         WHERE created_at >= ?
         GROUP BY DATE(created_at) 
         ORDER BY date`,
        [dateFilter]
      );

      // Applications by status
      const [applicationsByStatus] = await pool.query(
        `SELECT status, COUNT(*) as count 
         FROM partner_applications 
         WHERE created_at >= ?
         GROUP BY status`,
        [dateFilter]
      );

      // Applications by platform
      const [applicationsByPlatform] = await pool.query(
        `SELECT platform, COUNT(*) as count 
         FROM partner_applications 
         WHERE created_at >= ?
         GROUP BY platform`,
        [dateFilter]
      );

      // Average response time
      const [responseTime] = await pool.query(
        `SELECT 
          AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(approved_at, rejected_at))) as avg_response_hours
         FROM partner_applications 
         WHERE (approved_at IS NOT NULL OR rejected_at IS NOT NULL) 
         AND created_at >= ?`,
        [dateFilter]
      );

      return {
        applications_over_time: applicationsOverTime,
        applications_by_status: applicationsByStatus,
        applications_by_platform: applicationsByPlatform,
        average_response_hours: responseTime[0]?.avg_response_hours || 0,
        period,
      };
    } catch (error) {
      console.error("Error getting partnership analytics:", error);
      throw new Error("Failed to get partnership analytics");
    }
  },
};

export default PartnersService;
