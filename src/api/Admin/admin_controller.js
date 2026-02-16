import pool from "../../../database.js";
import AdminService from "./admin_services.js";
import {
  UserStatusSchema,
  CompetitionSchema,
  WithdrawalStatusSchema,
} from "./admin_validation.js";

import { Parser } from 'json2csv';
// Common function to generate and send CSV for KYC
const generateKycCSVResponse = (verifications, res, exportType) => {
  try {
    if (!verifications || verifications.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No KYC records found to export' 
      });
    }

// Helper function to flatten permissions object for CSV
const flattenPermissions = (permissions) => {
  if (!permissions || typeof permissions !== 'object') {
    return '';
  }
  
  const permissionList = [];
  for (const [module, actions] of Object.entries(permissions)) {
    if (Array.isArray(actions)) {
      permissionList.push(`${module}: ${actions.join(', ')}`);
    } else if (typeof actions === 'object') {
      // Handle nested permission objects
      for (const [action, value] of Object.entries(actions)) {
        if (value === true) {
          permissionList.push(`${module}.${action}`);
        }
      }
    }
  }
  
  return permissionList.join('; ');
};

// Common function to generate and send CSV for admins
const generateAdminCSVResponse = (admins, res, exportType) => {
  try {
    if (!admins || admins.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No admin records found to export' 
      });
    }

    // Format admins for CSV
    const formattedAdmins = admins.map(admin => {
      const csvAdmin = {
        id: admin.id,
        email: admin.email,
        username: admin.username,
        first_name: admin.first_name,
        last_name: admin.last_name,
        full_name: `${admin.first_name} ${admin.last_name}`,
        phone: admin.phone,
        status: admin.is_active ? 'Active' : 'Inactive',
        created_at: admin.created_at,
        last_login: admin.last_login,
        activity_count: admin.activity_count || 0,
        todays_activities: admin.todays_activities || 0,
        
        // Creator information
        created_by_id: admin.created_by_id,
        created_by_email: admin.created_by_email,
        created_by_name: admin.created_by_first_name 
          ? `${admin.created_by_first_name} ${admin.created_by_last_name}`
          : 'System',
        
        // Permissions
        permissions: flattenPermissions(admin.permissions),
        permissions_count: admin.permissions 
          ? Object.keys(admin.permissions).length 
          : 0
      };

      // If we have detailed stats
      if (admin.stats) {
        csvAdmin.total_activities = admin.stats.total_activities || 0;
        csvAdmin.competitions_created = admin.stats.competitions_created || 0;
        csvAdmin.winners_selected = admin.stats.winners_selected || 0;
        csvAdmin.users_edited = admin.stats.users_edited || 0;
        csvAdmin.kyc_approved = admin.stats.kyc_approved || 0;
        csvAdmin.kyc_rejected = admin.stats.kyc_rejected || 0;
        csvAdmin.last_activity = admin.stats.last_activity;
        csvAdmin.first_activity = admin.stats.first_activity;
      }

      // If we have role info
      if (admin.role_info) {
        csvAdmin.role_name = admin.role_info.role_name;
        csvAdmin.role_level = admin.role_info.level;
        csvAdmin.role_description = admin.role_info.description;
      }

      // If we have recent activities
      if (admin.recent_activities) {
        csvAdmin.recent_activity_count = admin.recent_activities.length;
        csvAdmin.last_activity_type = admin.recent_activities[0]?.action || 'None';
        csvAdmin.last_activity_date = admin.recent_activities[0]?.created_at || 'None';
      }

      return csvAdmin;
    });

    // Define CSV fields
    const fields = Object.keys(formattedAdmins[0] || {});
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedAdmins);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${exportType}_${timestamp}.csv`;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send CSV
    res.send(csv);

  } catch (error) {
    console.error('Admin CSV generation error:', error);
    throw new Error('Failed to generate admin CSV file');
  }
};

    // Format verifications for CSV
    const formattedVerifications = verifications.map(verification => {
      // Create a simplified version for CSV
      const csvVerification = {
        verification_id: verification.verification_id,
        user_id: verification.user_id,
        user_username: verification.username,
        user_email: verification.email,
        user_first_name: verification.user_first_name,
        user_last_name: verification.user_last_name,
        user_phone: verification.phone,
        user_country: verification.country,
        user_joined: verification.user_joined,
        
        verification_status: verification.status,
        verification_type: verification.verification_type,
        document_type: verification.document_type,
        document_number: verification.document_number,
        first_name: verification.first_name,
        last_name: verification.last_name,
        date_of_birth: verification.date_of_birth,
        government_id_type: verification.government_id_type,
        government_id_number: verification.government_id_number,
        
        verified_by: verification.verified_by_name || verification.verified_by,
        verified_by_email: verification.verified_by_email,
        verified_at: verification.verified_at,
        rejected_reason: verification.rejected_reason,
        created_at: verification.created_at,
        updated_at: verification.updated_at,
        
        // Document URLs
        document_front_url: verification.document_front_url,
        document_back_url: verification.document_back_url,
        selfie_url: verification.selfie_url,
      };

      // If we have detailed data with documents and reviews
      if (verification.documents) {
        csvVerification.document_count = verification.documents.length;
        csvVerification.documents = verification.documents.map(doc => 
          `${doc.document_type}: ${doc.file_name}`
        ).join('; ');
      }
      
      if (verification.reviews) {
        csvVerification.review_count = verification.reviews.length;
        csvVerification.last_review = verification.reviews[0] 
          ? `${verification.reviews[0].admin_name}: ${verification.reviews[0].new_status}`
          : 'No reviews';
      }

      return flattenObject(csvVerification);
    });

    // Define CSV fields
    const fields = Object.keys(formattedVerifications[0] || {});
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedVerifications);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${exportType}_${timestamp}.csv`;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send CSV
    res.send(csv);

  } catch (error) {
    console.error('KYC CSV generation error:', error);
    throw new Error('Failed to generate KYC CSV file');
  }
};

// Helper function to flatten nested objects for CSV
const flattenObject = (obj, prefix = '') => {
  return Object.keys(obj).reduce((acc, k) => {
    const pre = prefix.length ? prefix + '_' : '';
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(acc, flattenObject(obj[k], pre + k));
    } else if (Array.isArray(obj[k])) {
      acc[pre + k] = obj[k].map(item => 
        typeof item === 'object' ? JSON.stringify(item) : String(item)
      ).join('; ');
    } else {
      acc[pre + k] = obj[k];
    }
    return acc;
  }, {});
};

// Common function to generate and send CSV
const generateCSVResponse = (users, res, exportType) => {
  try {
    if (!users || users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No users found to export' 
      });
    }

    // Format users for CSV
    const formattedUsers = users.map(user => flattenObject(user));

    // Define CSV fields
    const fields = Object.keys(formattedUsers[0] || {});
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedUsers);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${exportType}_${timestamp}.csv`;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send CSV
    res.send(csv);

  } catch (error) {
    console.error('CSV generation error:', error);
    throw new Error('Failed to generate CSV file');
  }
};

const flattenPermissions = (permissions) => {
  if (!permissions || typeof permissions !== 'object') {
    return '';
  }
  
  const permissionList = [];
  for (const [module, actions] of Object.entries(permissions)) {
    if (Array.isArray(actions)) {
      permissionList.push(`${module}: ${actions.join(', ')}`);
    } else if (typeof actions === 'object') {
      // Handle nested permission objects
      for (const [action, value] of Object.entries(actions)) {
        if (value === true) {
          permissionList.push(`${module}.${action}`);
        }
      }
    }
  }
  
  return permissionList.join('; ');
};

// Common function to generate and send CSV for admins
const generateAdminCSVResponse = (admins, res, exportType) => {
  try {
    if (!admins || admins.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No admin records found to export' 
      });
    }

    // Format admins for CSV
    const formattedAdmins = admins.map(admin => {
      const csvAdmin = {
        id: admin.id,
        email: admin.email,
        username: admin.username,
        first_name: admin.first_name,
        last_name: admin.last_name,
        full_name: `${admin.first_name} ${admin.last_name}`,
        phone: admin.phone,
        status: admin.is_active ? 'Active' : 'Inactive',
        created_at: admin.created_at,
        last_login: admin.last_login,
        activity_count: admin.activity_count || 0,
        todays_activities: admin.todays_activities || 0,
        
        // Creator information
        created_by_id: admin.created_by_id,
        created_by_email: admin.created_by_email,
        created_by_name: admin.created_by_first_name 
          ? `${admin.created_by_first_name} ${admin.created_by_last_name}`
          : 'System',
        
        // Permissions
        permissions: flattenPermissions(admin.permissions),
        permissions_count: admin.permissions 
          ? Object.keys(admin.permissions).length 
          : 0
      };

      // If we have detailed stats
      if (admin.stats) {
        csvAdmin.total_activities = admin.stats.total_activities || 0;
        csvAdmin.competitions_created = admin.stats.competitions_created || 0;
        csvAdmin.winners_selected = admin.stats.winners_selected || 0;
        csvAdmin.users_edited = admin.stats.users_edited || 0;
        csvAdmin.kyc_approved = admin.stats.kyc_approved || 0;
        csvAdmin.kyc_rejected = admin.stats.kyc_rejected || 0;
        csvAdmin.last_activity = admin.stats.last_activity;
        csvAdmin.first_activity = admin.stats.first_activity;
      }

      // If we have role info
      if (admin.role_info) {
        csvAdmin.role_name = admin.role_info.role_name;
        csvAdmin.role_level = admin.role_info.level;
        csvAdmin.role_description = admin.role_info.description;
      }

      // If we have recent activities
      if (admin.recent_activities) {
        csvAdmin.recent_activity_count = admin.recent_activities.length;
        csvAdmin.last_activity_type = admin.recent_activities[0]?.action || 'None';
        csvAdmin.last_activity_date = admin.recent_activities[0]?.created_at || 'None';
      }

      return csvAdmin;
    });

    // Define CSV fields
    const fields = Object.keys(formattedAdmins[0] || {});
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(formattedAdmins);

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${exportType}_${timestamp}.csv`;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send CSV
    res.send(csv);

  } catch (error) {
    console.error('Admin CSV generation error:', error);
    throw new Error('Failed to generate admin CSV file');
  }
};
const adminController = {
  getDashboardStats: async (req, res) => {
    try {
      const stats = await AdminService.getDashboardStats();
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      console.error("Dashboard stats error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getAllUsers: async (req, res) => {
    try {
      const { page = 1, limit = 20, search, role, status } = req.query;
      const users = await AdminService.getAllUsers({
        page,
        limit,
        search,
        role,
        status,
      });
      res.status(200).json({ success: true, data: users });
    } catch (err) {
      console.error("Get users error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getUserDetails: async (req, res) => {
    try {
      const { user_id } = req.params;
      const user = await AdminService.getUserDetails(user_id);

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      res.status(200).json({ success: true, data: user });
    } catch (err) {
      console.error("Get user details error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
  
getUserStats: async (req, res) => {
  try {
    const stats = await AdminService.getUserStats();
    res.status(200).json({ success: true, data: stats });
  } catch (err) {
    console.error("Get user stats error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},
 updateUserStatus : async (req, res) => {
  try {
    const {  status, reason } = req.body;
    const { user_id } = req.params;
    const admin_id = req.user.id;
    
    // Validate inputs
    if (!user_id || !status || !reason) {
      return res.status(400).json({
        success: false,
        message: "user_id, status, and reason are required"
      });
    }
    const validStatuses = ["active", "suspended", "verified", "unverified"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      });
    }

    // Call the service function
    const result = await AdminService.updateUserStatus(
      user_id, 
      status, 
      reason, 
      admin_id, 
      req.ip,
      req.headers['user-agent'] || null
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    console.error("Update user status error:", error);
    
    // Handle specific errors
    if (error.message.includes("User not found")) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

  impersonateUser: async (req, res) => {
    try {
      const { user_id } = req.params;
      const token = await AdminService.impersonateUser(user_id, req.user.id);
      res.status(200).json({ success: true, data: { token } });
    } catch (err) {
      console.error("Impersonate user error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  getAllCompetitions: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, category } = req.query;
      const competitions = await AdminService.getAllCompetitions({
        page,
        limit,
        status,
        category,
      });
      res.status(200).json({ success: true, data: competitions });
    } catch (err) {
      console.error("Get competitions error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  createCompetition: async (req, res) => {
    try {
      const competitionData = CompetitionSchema.parse(req.body);
      const competition = await AdminService.createCompetition(
        competitionData,
        req.user.id
      );
      res.status(201).json({
        success: true,
        data: competition,
        message: "Competition created",
      });
    } catch (err) {
      console.error("Create competition error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  updateCompetition: async (req, res) => {
    try {
      const { id } = req.params;
      const competitionData = CompetitionSchema.partial().parse(req.body);
      await AdminService.updateCompetition(id, competitionData, req.user.id);
      res.status(200).json({ success: true, message: "Competition updated" });
    } catch (err) {
      console.error("Update competition error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  deleteCompetition: async (req, res) => {
    try {
      const { id } = req.params;
      await AdminService.deleteCompetition(id, req.user.id);
      res.status(200).json({ success: true, message: "Competition deleted" });
    } catch (err) {
      console.error("Delete competition error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  drawWinner: async (req, res) => {
    try {
      const { id } = req.params;
      const winner = await AdminService.drawCompetitionWinner(id, req.user.id);
      res.status(200).json({
        success: true,
        data: winner,
        message: "Winner drawn successfully",
      });
    } catch (err) {
      console.error("Draw winner error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  getWithdrawals: async (req, res) => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const withdrawals = await AdminService.getWithdrawals({
        page,
        limit,
        status,
      });
      res.status(200).json({ success: true, data: withdrawals });
    } catch (err) {
      console.error("Get withdrawals error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  updateWithdrawalStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, admin_notes } = WithdrawalStatusSchema.parse(req.body);

      await AdminService.updateWithdrawalStatus(
        id,
        status,
        admin_notes,
        req.user.id
      );
      res
        .status(200)
        .json({ success: true, message: "Withdrawal status updated" });
    } catch (err) {
      console.error("Update withdrawal status error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  getTransactions: async (req, res) => {
    try {
      const { page = 1, limit = 50, type, start_date, end_date } = req.query;
      const transactions = await AdminService.getTransactions({
        page,
        limit,
        type,
        start_date,
        end_date,
      });
      res.status(200).json({ success: true, data: transactions });
    } catch (err) {
      console.error("Get transactions error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getSystemOverview: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const overview = await AdminService.getSystemOverview(period);
      res.status(200).json({ success: true, data: overview });
    } catch (err) {
      console.error("Get system overview error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getRevenueAnalytics: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const revenue = await AdminService.getRevenueAnalytics(period);
      res.status(200).json({ success: true, data: revenue });
    } catch (err) {
      console.error("Get revenue analytics error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getUserGrowth: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      const growth = await AdminService.getUserGrowth(period);
      res.status(200).json({ success: true, data: growth });
    } catch (err) {
      console.error("Get user growth error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getRecentWinners: async (req, res) => {
    try {
      const { limit = 10 } = req.query;
      const winners = await AdminService.getRecentWinners(limit);
      res.status(200).json({ success: true, data: winners });
    } catch (err) {
      console.error("Get recent winners error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  featureWinner: async (req, res) => {
    try {
      const { winner_id } = req.body;
      await AdminService.featureWinner(winner_id, req.user.id);
      res
        .status(200)
        .json({ success: true, message: "Winner featured successfully" });
    } catch (err) {
      console.error("Feature winner error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },
  // Add to adminController



  // NEW: Get KYC statistics for dashboard cards
  getKycStatistics: async () => {
    try {
      const [stats] = await pool.query(`
        SELECT 
          -- Pending verifications
          (SELECT COUNT(*) FROM verifications WHERE status = 'PENDING') as pending_review,
          
          -- Approved today
          (SELECT COUNT(*) FROM verifications 
           WHERE status = 'APPROVED' AND DATE(verified_at) = CURDATE()) as approved_today,
          
          -- Rejected today
          (SELECT COUNT(*) FROM verifications 
           WHERE status = 'REJECTED' AND DATE(verified_at) = CURDATE()) as rejected_today,
          
          -- Total verified (approved verifications)
          (SELECT COUNT(*) FROM verifications WHERE status = 'APPROVED') as total_verified,
          
          -- Under review (users with kyc_status = 'under_review')
          (SELECT COUNT(*) FROM users WHERE kyc_status = 'under_review') as under_review_users,
          
          -- Average verification time (in hours)
          (SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, verified_at)) 
           FROM verifications WHERE status = 'APPROVED') as avg_verification_hours,
           
          -- Rejection rate
          (SELECT 
            ROUND(
              (COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) * 100.0) / 
              GREATEST(COUNT(*), 1), 
              2
            )
           FROM verifications 
           WHERE status IN ('APPROVED', 'REJECTED')
          ) as rejection_rate_percent
        FROM DUAL
      `);

      return {
        pending: stats[0].pending_review || 0,
        approved_today: stats[0].approved_today || 0,
        rejected_today: stats[0].rejected_today || 0,
        total_verified: stats[0].total_verified || 0,
        under_review_users: stats[0].under_review_users || 0,
        avg_verification_hours: stats[0].avg_verification_hours || 0,
        rejection_rate: stats[0].rejection_rate_percent || 0
      };
    } catch (error) {
      console.error("Error getting KYC statistics:", error);
      throw new Error("Failed to get KYC statistics");
    }
  },

  getPendingVerifications: async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const verifications = await AdminService.getPendingVerifications({
        page,
        limit,
      });
      res.status(200).json({ success: true, data: verifications });
    } catch (err) {
      console.error("Get pending verifications error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getUserVerification: async (req, res) => {
    try {
      const { user_id } = req.params;
      const verification = await AdminService.getUserVerification(user_id);

      if (!verification) {
        return res
          .status(404)
          .json({ success: false, message: "Verification not found" });
      }

      res.status(200).json({ success: true, data: verification });
    } catch (err) {
      console.error("Get user verification error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  updateVerificationStatus: async (req, res) => {
    try {
      const { user_id } = req.params;
      const { status, rejection_reason } = req.body;

      await AdminService.updateVerificationStatus(
        user_id,
        status,
        rejection_reason,
        req.user.id
      );
      res
        .status(200)
        .json({ success: true, message: "Verification status updated" });
    } catch (err) {
      console.error("Update verification status error:", err);
      res.status(400).json({ success: false, error: err.message });
    }
  },

  getAllVerifications: async (req, res) => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const verifications = await AdminService.getAllVerifications({
        page,
        limit,
        status,
      });
      res.status(200).json({ success: true, data: verifications });
    } catch (err) {
      console.error("Get all verifications error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },
  getKycDashboardStats: async (req, res) => {
    try {
      const stats = await AdminService.getKycDashboardStats();
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      console.error("Get KYC dashboard stats error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // NEW: Bulk update verifications
  bulkUpdateVerifications: async (req, res) => {
    try {
      const { user_ids, status, rejection_reason } = req.body;
      const adminId = req.user.id;

      if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: "user_ids array is required and cannot be empty"
        });
      }

      if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: "status must be APPROVED, REJECTED, or PENDING"
        });
      }

      const result = await AdminService.bulkUpdateVerifications(
        user_ids,
        status,
        adminId,
        rejection_reason
      );

      res.status(200).json({ success: true, data: result });
    } catch (err) {
      console.error("Bulk update verifications error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // NEW: Get verification statistics for cards
  getVerificationStats: async (req, res) => {
    try {
      const [stats] = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM verifications WHERE status = 'PENDING') as pending_review,
          (SELECT COUNT(*) FROM verifications WHERE status = 'APPROVED') as approved_today,
          (SELECT COUNT(*) FROM verifications WHERE status = 'REJECTED') as rejected_today,
          (SELECT COUNT(*) FROM verifications WHERE status = 'APPROVED') as total_verified
        FROM DUAL
      `);

      res.status(200).json({
        success: true,
        data: {
          pending: stats[0].pending_review || 0,
          approved_today: stats[0].approved_today || 0,
          rejected_today: stats[0].rejected_today || 0,
          total_verified: stats[0].total_verified || 0
        }
      });
    } catch (err) {
      console.error("Get verification stats error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },


  getUserConsents: async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const consents = await AdminService.getUserConsents({ page, limit });
      res.status(200).json({ success: true, data: consents });
    } catch (err) {
      console.error("Get user consents error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  getUserConsentDetails: async (req, res) => {
    try {
      const { user_id } = req.params;
      const consents = await AdminService.getUserConsentDetails(user_id);
      res.status(200).json({ success: true, data: consents });
    } catch (err) {
      console.error("Get user consent details error:", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  },

  // Delete user permanently
deleteUser: async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await AdminService.deleteUser({ user_id });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Soft delete user (mark as deleted)
softDeleteUser: async (req, res) => {
  try {
    const { user_id } = req.params;
    const { reason } = req.body; // Optional reason for deletion
    const result = await AdminService.softDeleteUser({ 
      user_id, 
      reason 
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Soft delete user error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Suspend user (set is_active to false)
suspendUser: async (req, res) => {
  try {
    const { user_id } = req.params;
    const { reason } = req.body; // Optional reason for suspension
    const result = await AdminService.suspendUser({ 
      user_id, 
      reason 
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Suspend user error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Activate/Unsuspend user (set is_active to true)
activateUser: async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await AdminService.activateUser({ user_id });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("Activate user error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},


// Export all Users
exportAllUsers: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllUsers({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'all_users');
  } catch (err) {
    console.error("Export all users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Active Users
exportActiveUsers: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllActiveUsers({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'active_users');
  } catch (err) {
    console.error("Export active users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Pending Users
exportPendingUsers: async (req, res) => {
  try {
    const { search, role } = req.query;
    const users = await AdminService.exportAllPendingUsers({
      search,
      role,
    });
    
    generateCSVResponse(users, res, 'pending_users');
  } catch (err) {
    console.error("Export pending users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Suspended Users
exportSuspendedUsers: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllSuspendedUsers({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'suspended_users');
  } catch (err) {
    console.error("Export suspended users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export by Date Range
exportByDateRange: async (req, res) => {
  try {
    const { startDate, endDate, search, role, status } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: "Start date and end date are required" 
      });
    }
    
    const users = await AdminService.exportByDateRange({
      startDate,
      endDate,
      search,
      role,
      status,
    });
    
    const filename = `users_${startDate}_to_${endDate}`;
    generateCSVResponse(users, res, filename);
  } catch (err) {
    console.error("Export by date range error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Tier 1 Users
exportTier1Users: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllTier1Users({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'tier_1_users');
  } catch (err) {
    console.error("Export tier 1 users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Tier 2 Users
exportTier2Users: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllTier2Users({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'tier_2_users');
  } catch (err) {
    console.error("Export tier 2 users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Tier 3 Users
exportTier3Users: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllTier3Users({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'tier_3_users');
  } catch (err) {
    console.error("Export tier 3 users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Free Users
exportFreeUsers: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllFreeUsers({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'free_users');
  } catch (err) {
    console.error("Export free users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export detailed users (with all information)
exportDetailedUsers: async (req, res) => {
  try {
    const { limit = 100, search, role, status } = req.query;
    const users = await AdminService.exportDetailedUsers({
      limit: parseInt(limit),
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'detailed_users_report');
  } catch (err) {
    console.error("Export detailed users error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Bulk export endpoint
exportUsersBulk: async (req, res) => {
  try {
    const { 
      type, 
      startDate, 
      endDate, 
      tier,
      search,
      role,
      status,
      limit = 1000
    } = req.body;

    let users = [];
    
    switch (type) {
      case 'all':
        users = await AdminService.exportAllUsers({ search, role, status });
        break;
        
      case 'active':
        users = await AdminService.exportAllActiveUsers({ search, role, status });
        break;
        
      case 'pending':
        users = await AdminService.exportAllPendingUsers({ search, role });
        break;
        
      case 'suspended':
        users = await AdminService.exportAllSuspendedUsers({ search, role, status });
        break;
        
      case 'by_date':
        if (!startDate || !endDate) {
          return res.status(400).json({ 
            success: false, 
            error: "Start date and end date are required for date range export" 
          });
        }
        users = await AdminService.exportByDateRange({ 
          startDate, 
          endDate, 
          search, 
          role, 
          status 
        });
        break;
        
      case 'by_tier':
        if (!tier) {
          return res.status(400).json({ 
            success: false, 
            error: "Tier is required for tier export" 
          });
        }
        
        if (tier === '1') {
          users = await AdminService.exportAllTier1Users({ search, role, status });
        } else if (tier === '2') {
          users = await AdminService.exportAllTier2Users({ search, role, status });
        } else if (tier === '3') {
          users = await AdminService.exportAllTier3Users({ search, role, status });
        } else if (tier === 'free') {
          users = await AdminService.exportAllFreeUsers({ search, role, status });
        } else {
          return res.status(400).json({ 
            success: false, 
            error: "Invalid tier. Must be 1, 2, 3, or free" 
          });
        }
        break;
        
      case 'detailed':
        users = await AdminService.exportDetailedUsers({ 
          limit: parseInt(limit), 
          search, 
          role, 
          status 
        });
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: "Invalid export type" 
        });
    }
    
    generateCSVResponse(users, res, `${type}_export`);
    
  } catch (err) {
    console.error("Bulk export error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all (from your image - simple wrapper for exportAllUsers)
exportAll: async (req, res) => {
  try {
    const { search, role, status } = req.query;
    const users = await AdminService.exportAllUsers({
      search,
      role,
      status,
    });
    
    generateCSVResponse(users, res, 'export_all');
  } catch (err) {
    console.error("Export all error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all KYC
 exportAllKYC : async (req, res) => {
  try {
    const { search, status, documentType } = req.query;
    const verifications = await AdminService.exportAllKYC({
      search,
      status,
      documentType,
    });
    
    generateKycCSVResponse(verifications, res, 'all_kyc');
  } catch (err) {
    console.error("Export all KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Pending KYC
 exportPendingKYC : async (req, res) => {
  try {
    const { search, documentType } = req.query;
    const verifications = await AdminService.exportAllPendingKYC({
      search,
      documentType,
    });
    
    generateKycCSVResponse(verifications, res, 'pending_kyc');
  } catch (err) {
    console.error("Export pending KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Approved KYC
 exportApprovedKYC : async (req, res) => {
  try {
    const { search, documentType } = req.query;
    const verifications = await AdminService.exportAllApprovedKYC({
      search,
      documentType,
    });
    
    generateKycCSVResponse(verifications, res, 'approved_kyc');
  } catch (err) {
    console.error("Export approved KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Rejected KYC
 exportRejectedKYC : async (req, res) => {
  try {
    const { search, documentType } = req.query;
    const verifications = await AdminService.exportAllRejectedKYC({
      search,
      documentType,
    });
    
    generateKycCSVResponse(verifications, res, 'rejected_kyc');
  } catch (err) {
    console.error("Export rejected KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export by document type: Driver's License
 exportDriversLicenseKYC :async (req, res) => {
  try {
    const { search, status } = req.query;
    const verifications = await AdminService.exportDriversLicenseKYC({
      search,
      status,
    });
    
    generateKycCSVResponse(verifications, res, 'drivers_license_kyc');
  } catch (err) {
    console.error("Export driver's license KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export by document type: Passport
 exportPassportKYC : async (req, res) => {
  try {
    const { search, status } = req.query;
    const verifications = await AdminService.exportPassportKYC({
      search,
      status,
    });
    
    generateKycCSVResponse(verifications, res, 'passport_kyc');
  } catch (err) {
    console.error("Export passport KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export by document type: National ID
exportNationalIdKYC : async (req, res) => {
  try {
    const { search, status } = req.query;
    const verifications = await AdminService.exportNationalIdKYC({
      search,
      status,
    });
    
    generateKycCSVResponse(verifications, res, 'national_id_kyc');
  } catch (err) {
    console.error("Export national ID KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export detailed KYC
 exportDetailedKYC : async (req, res) => {
  try {
    const { limit = 100, search, status, documentType } = req.query;
    const verifications = await AdminService.exportDetailedKYC({
      limit: parseInt(limit),
      search,
      status,
      documentType,
    });
    
    generateKycCSVResponse(verifications, res, 'detailed_kyc_report');
  } catch (err) {
    console.error("Export detailed KYC error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Bulk KYC export endpoint
 exportKycBulk : async (req, res) => {
  try {
    const { 
      type, 
      status,
      documentType,
      search,
      limit = 100
    } = req.body;

    let verifications = [];
    
    switch (type) {
      case 'all':
        verifications = await AdminService.exportAllKYC({ 
          search, 
          status, 
          documentType 
        });
        break;
        
      case 'pending':
        verifications = await AdminService.exportAllPendingKYC({ 
          search, 
          documentType 
        });
        break;
        
      case 'approved':
        verifications = await AdminService.exportAllApprovedKYC({ 
          search, 
          documentType 
        });
        break;
        
      case 'rejected':
        verifications = await AdminService.exportAllRejectedKYC({ 
          search, 
          documentType 
        });
        break;
        
      case 'drivers_license':
        verifications = await AdminService.exportDriversLicenseKYC({ 
          search, 
          status 
        });
        break;
        
      case 'passport':
        verifications = await AdminService.exportPassportKYC({ 
          search, 
          status 
        });
        break;
        
      case 'national_id':
        verifications = await AdminService.exportNationalIdKYC({ 
          search, 
          status 
        });
        break;
        
      case 'detailed':
        verifications = await AdminService.exportDetailedKYC({ 
          limit: parseInt(limit), 
          search, 
          status, 
          documentType 
        });
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: "Invalid KYC export type" 
        });
    }
    
    generateKycCSVResponse(verifications, res, `${type}_kyc_export`);
    
  } catch (err) {
    console.error("Bulk KYC export error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},


// Export all Admins
 exportAllAdmins : async (req, res) => {
  try {
    const { search, status } = req.query;
    const admins = await AdminService.exportAllAdmins({
      search,
      status,
    });
    
    generateAdminCSVResponse(admins, res, 'all_admins');
  } catch (err) {
    console.error("Export all admins error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

 exportActiveAdmins : async (req, res) => {
  try {
    const { search } = req.query;
    const admins = await AdminService.exportAllActiveAdmins({
      search,
    });
    
    generateAdminCSVResponse(admins, res, 'active_admins');
  } catch (err) {
    console.error("Export active admins error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all Inactive Admins
 exportInactiveAdmins : async (req, res) => {
  try {
    const { search } = req.query;
    const admins = await AdminService.exportAllInactiveAdmins({
      search,
    });
    
    generateAdminCSVResponse(admins, res, 'inactive_admins');
  } catch (err) {
    console.error("Export inactive admins error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export detailed admins
 exportDetailedAdmins : async (req, res) => {
  try {
    const { limit = 100, search, status } = req.query;
    const admins = await AdminService.exportDetailedAdmins({
      limit: parseInt(limit),
      search,
      status,
    });
    
    generateAdminCSVResponse(admins, res, 'detailed_admins_report');
  } catch (err) {
    console.error("Export detailed admins error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Export all (from your image - simple wrapper for exportAllAdmins)
exportAll : async (req, res) => {
 try {
    const { search, status } = req.query;
    const admins = await AdminService.exportAllAdmins({
      search,
      status,
    });
    
    generateAdminCSVResponse(admins, res, 'export_all_admins');
  } catch (err) {
    console.error("Export all admins error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},

// Bulk admin export endpoint
 exportAdminsBulk : async (req, res) => {
  try {
    const { 
      type, 
      status,
      search,
      limit = 100
    } = req.body;

    let admins = [];
    
    switch (type) {
      case 'all':
        admins = await AdminService.exportAllAdmins({ 
          search, 
          status 
        });
        break;
        
      case 'active':
        admins = await AdminService.exportAllActiveAdmins({ 
          search 
        });
        break;
        
      case 'inactive':
        admins = await AdminService.exportAllInactiveAdmins({ 
          search 
        });
        break;
        
      case 'detailed':
        admins = await AdminService.exportDetailedAdmins({ 
          limit: parseInt(limit), 
          search, 
          status 
        });
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: "Invalid admin export type" 
        });
    }
    
    generateAdminCSVResponse(admins, res, `${type}_admin_export`);
    
  } catch (err) {
    console.error("Bulk admin export error:", err);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
},


};

export default adminController;


