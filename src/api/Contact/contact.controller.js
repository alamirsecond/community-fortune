import pool from "../../../database.js";
import { v4 as uuidv4 } from 'uuid';
import {
  ContactMessageSchema,
  ContactResponseSchema,
  ContactSettingsSchema,
  ContactFilterSchema
} from "./contact.validator.js";

const contactController = {
  // Submit contact message (Public) - Only 3 fields as per image
  submitMessage: async (req, res) => {
    try {
      const parsed = ContactMessageSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          errors: parsed.error.issues.map(issue => ({
            field: issue.path[0],
            message: issue.message
          }))
        });
      }

      const { full_name, email, message } = parsed.data;
      
      // Extract category from message content (optional feature)
      let category = 'GENERAL';
      const messageLower = message.toLowerCase();
      
      if (messageLower.includes('support') || messageLower.includes('help')) {
        category = 'SUPPORT';
      } else if (messageLower.includes('bug') || messageLower.includes('error') || messageLower.includes('technical')) {
        category = 'TECHNICAL';
      } else if (messageLower.includes('payment') || messageLower.includes('billing') || messageLower.includes('refund')) {
        category = 'BILLING';
      } else if (messageLower.includes('feedback') || messageLower.includes('suggestion')) {
        category = 'FEEDBACK';
      } else if (messageLower.includes('complaint') || messageLower.includes('issue') || messageLower.includes('problem')) {
        category = 'COMPLAINT';
      }
      
      const [result] = await pool.query(
        `INSERT INTO contact_messages 
          (id, full_name, email, message, category) 
         VALUES 
          (UUID_TO_BIN(?), ?, ?, ?, ?)`,
        [uuidv4(), full_name, email, message, category]
      );

      // Send confirmation email
      // await sendContactConfirmationEmail(email, full_name);

      res.status(201).json({
        success: true,
        message: "Thank you for your message. We'll get back to you soon.",
        data: {
          messageId: result.insertId,
          submittedAt: new Date().toISOString(),
          category // Return detected category for debugging
        }
      });
    } catch (err) {
      console.error("Error submitting contact message:", err);
      res.status(500).json({
        success: false,
        message: "Failed to submit message. Please try again later."
      });
    }
  },

  // Get all contact messages (Admin only)
  getAllMessages: async (req, res) => {
    try {
      const parsed = ContactFilterSchema.safeParse(req.query);
      
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          errors: parsed.error.issues.map(issue => issue.message)
        });
      }

      const {
        status,
        category,
        priority,
        start_date,
        end_date,
        search,
        page = "1",
        limit = "20"
      } = parsed.data;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;

      let query = `
        SELECT 
          BIN_TO_UUID(id) as id,
          full_name,
          email,
          message,
          status,
          priority,
          category,
          admin_notes,
          assigned_to,
          response_sent,
          response_message,
          response_sent_at,
          created_at,
          updated_at,
          -- Show message preview (first 100 chars)
          SUBSTRING(message, 1, 100) as message_preview
        FROM contact_messages
        WHERE 1=1
      `;
      
      const params = [];

      if (status) {
        query += " AND status = ?";
        params.push(status);
      }

      if (category) {
        query += " AND category = ?";
        params.push(category);
      }

      if (priority) {
        query += " AND priority = ?";
        params.push(priority);
      }

      if (start_date) {
        query += " AND DATE(created_at) >= ?";
        params.push(start_date);
      }

      if (end_date) {
        query += " AND DATE(created_at) <= ?";
        params.push(end_date);
      }

      if (search) {
        query += " AND (full_name LIKE ? OR email LIKE ? OR message LIKE ?)";
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(limitNum, offset);

      const [messages] = await pool.query(query, params);

      // Get total count
      let countQuery = "SELECT COUNT(*) as total FROM contact_messages WHERE 1=1";
      const countParams = params.slice(0, -2);

      const [countResult] = await pool.query(countQuery, countParams);
      const total = countResult[0]?.total || 0;

      // Get statistics
      const [stats] = await pool.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM contact_messages
        GROUP BY status
        ORDER BY status
      `);

      res.status(200).json({
        success: true,
        data: messages,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        },
        statistics: {
          byStatus: stats,
          totalMessages: total
        }
      });
    } catch (err) {
      console.error("Error fetching contact messages:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch contact messages"
      });
    }
  },

  // Get single message by ID (Admin only)
  getMessageById: async (req, res) => {
    try {
      const { id } = req.params;

      const [rows] = await pool.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          full_name,
          email,
          message,
          status,
          priority,
          category,
          admin_notes,
          assigned_to,
          response_sent,
          response_message,
          response_sent_at,
          created_at,
          updated_at
         FROM contact_messages 
         WHERE id = UUID_TO_BIN(?)`,
        [id]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Contact message not found"
        });
      }

      res.status(200).json({
        success: true,
        data: rows[0]
      });
    } catch (err) {
      console.error("Error fetching contact message:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch contact message"
      });
    }
  },

  // Update message status/priority (Admin only)
  updateMessage: async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = ContactResponseSchema.partial().safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          errors: parsed.error.issues.map(issue => issue.message)
        });
      }

      const { status, priority, admin_notes } = parsed.data;
      const adminUser = req.user.email || req.user.username;

      const updateFields = [];
      const params = [];

      if (status) {
        updateFields.push("status = ?");
        params.push(status);
      }

      if (priority) {
        updateFields.push("priority = ?");
        params.push(priority);
      }

      if (admin_notes !== undefined) {
        updateFields.push("admin_notes = ?");
        params.push(admin_notes);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields to update"
        });
      }

      updateFields.push("assigned_to = ?");
      params.push(adminUser);

      params.push(id);

      const [result] = await pool.query(
        `UPDATE contact_messages 
         SET ${updateFields.join(", ")} 
         WHERE id = UUID_TO_BIN(?)`,
        params
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Contact message not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Message updated successfully"
      });
    } catch (err) {
      console.error("Error updating contact message:", err);
      res.status(500).json({
        success: false,
        message: "Failed to update message"
      });
    }
  },

  // Send response to message (Admin only)
  sendResponse: async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = ContactResponseSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          errors: parsed.error.issues.map(issue => issue.message)
        });
      }

      const { response_message, status = 'RESOLVED' } = parsed.data;
      const adminUser = req.user.email || req.user.username;

      // Get message details for email
      const [message] = await pool.query(
        `SELECT email, full_name FROM contact_messages WHERE id = UUID_TO_BIN(?)`,
        [id]
      );

      if (!message.length) {
        return res.status(404).json({
          success: false,
          message: "Contact message not found"
        });
      }

      await pool.query(
        `UPDATE contact_messages 
         SET response_message = ?,
             response_sent = TRUE,
             response_sent_at = NOW(),
             status = ?,
             assigned_to = ?,
             updated_at = NOW()
         WHERE id = UUID_TO_BIN(?)`,
        [response_message, status, adminUser, id]
      );

      // Send email response
      // await sendContactResponseEmail(
      //   message[0].email,
      //   message[0].full_name,
      //   response_message
      // );

      res.status(200).json({
        success: true,
        message: "Response sent successfully"
      });
    } catch (err) {
      console.error("Error sending response:", err);
      res.status(500).json({
        success: false,
        message: "Failed to send response"
      });
    }
  },

  // Get contact settings (Public)
  getContactSettings: async (req, res) => {
    try {
      const [settings] = await pool.query(
        "SELECT setting_key, setting_value, description FROM contact_settings ORDER BY id"
      );

      const settingsObject = settings.reduce((acc, setting) => {
        acc[setting.setting_key] = setting.setting_value;
        return acc;
      }, {});

      res.status(200).json({
        success: true,
        data: settingsObject
      });
    } catch (err) {
      console.error("Error fetching contact settings:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch contact settings"
      });
    }
  },

  // Update contact settings (Admin only)
  updateContactSettings: async (req, res) => {
    try {
      const parsed = ContactSettingsSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          errors: parsed.error.issues.map(issue => issue.message)
        });
      }

      const { setting_key, setting_value } = parsed.data;
      const adminUser = req.user.email || req.user.username;

      const [result] = await pool.query(
        `INSERT INTO contact_settings (setting_key, setting_value) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE 
           setting_value = VALUES(setting_value),
           updated_at = NOW()`,
        [setting_key, setting_value]
      );

      res.status(200).json({
        success: true,
        message: "Contact settings updated successfully",
        data: {
          setting_key,
          setting_value,
          updated_by: adminUser,
          updated_at: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error("Error updating contact settings:", err);
      res.status(500).json({
        success: false,
        message: "Failed to update contact settings"
      });
    }
  },

  // Get message statistics (Admin only)
  getMessageStatistics: async (req, res) => {
    try {
      const { start_date, end_date } = req.query;

      let dateFilter = "";
      const params = [];

      if (start_date && end_date) {
        dateFilter = "WHERE DATE(created_at) BETWEEN ? AND ?";
        params.push(start_date, end_date);
      } else if (start_date) {
        dateFilter = "WHERE DATE(created_at) >= ?";
        params.push(start_date);
      } else if (end_date) {
        dateFilter = "WHERE DATE(created_at) <= ?";
        params.push(end_date);
      }

      const [categoryStats] = await pool.query(`
        SELECT 
          category,
          COUNT(*) as count
        FROM contact_messages
        ${dateFilter}
        GROUP BY category
        ORDER BY count DESC
      `, params);

      const [statusStats] = await pool.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM contact_messages
        ${dateFilter}
        GROUP BY status
        ORDER BY status
      `, params);

      const [dailyStats] = await pool.query(`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as message_count
        FROM contact_messages
        ${dateFilter}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `, params);

      const [responseStats] = await pool.query(`
        SELECT 
          SUM(CASE WHEN response_sent = TRUE THEN 1 ELSE 0 END) as responded,
          SUM(CASE WHEN response_sent = FALSE THEN 1 ELSE 0 END) as pending_response,
          AVG(TIMESTAMPDIFF(HOUR, created_at, response_sent_at)) as avg_response_hours
        FROM contact_messages
        WHERE response_sent_at IS NOT NULL
        ${dateFilter ? dateFilter.replace('created_at', 'created_at') : ''}
      `, params);

      res.status(200).json({
        success: true,
        data: {
          byCategory: categoryStats,
          byStatus: statusStats,
          dailyTrend: dailyStats,
          responseMetrics: responseStats[0],
          totalMessages: categoryStats.reduce((sum, item) => sum + item.count, 0)
        }
      });
    } catch (err) {
      console.error("Error fetching message statistics:", err);
      res.status(500).json({
        success: false,
        message: "Failed to fetch statistics"
      });
    }
  },

  // Delete message (Admin only)
  deleteMessage: async (req, res) => {
    try {
      const { id } = req.params;

      const [result] = await pool.query(
        "DELETE FROM contact_messages WHERE id = UUID_TO_BIN(?)",
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Contact message not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Message deleted successfully"
      });
    } catch (err) {
      console.error("Error deleting contact message:", err);
      res.status(500).json({
        success: false,
        message: "Failed to delete message"
      });
    }
  }
};

export default contactController;