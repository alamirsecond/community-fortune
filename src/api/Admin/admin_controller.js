import pool from "../../../database.js";
import AdminService from "./admin_services.js";
import {
  UserStatusSchema,
  CompetitionSchema,
  WithdrawalStatusSchema,
} from "./admin_validation.js";

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
  updateUserStatus: async (req, res) => {
    try {
      const { user_id } = req.params;
      const { status, reason } = UserStatusSchema.parse(req.body);

      await AdminService.updateUserStatus(user_id, status, reason, req.user.id);
      res.status(200).json({ success: true, message: "User status updated" });
    } catch (err) {
      console.error("Update user status error:", err);
      res.status(400).json({ success: false, error: err.message });
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
}
};

export default adminController;
