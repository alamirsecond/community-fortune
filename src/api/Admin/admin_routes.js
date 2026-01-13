import { Router } from "express";
import adminController from "./admin_controller.js";
import authenticate from "./../../../middleware/auth.js";
const adminRouter = Router();
// All routes require ADMIN role
adminRouter.use(authenticate(["ADMIN"]));

// Dashboard Analytics
adminRouter.get("/dashboard", adminController.getDashboardStats);

// User Management
adminRouter.get("/users", adminController.getAllUsers);
adminRouter.get("/users/:user_id", adminController.getUserDetails);
adminRouter.put("/users/:user_id/status", adminController.updateUserStatus);
adminRouter.post("/users/:user_id/impersonate", adminController.impersonateUser);
adminRouter.delete("/users/:user_id", adminController.deleteUser);
adminRouter.put("/users/:user_id/deactivate", adminController.softDeleteUser); 
adminRouter.put("/users/:user_id/suspend", adminController.suspendUser);
adminRouter.put("/users/:user_id/activate", adminController.activateUser);
adminRouter.get("/users/stats", adminController.getUserStats);
// Competition Management
adminRouter.get("/competitions", adminController.getAllCompetitions);
adminRouter.post("/competitions", adminController.createCompetition);
adminRouter.put("/competitions/:id", adminController.updateCompetition);
adminRouter.delete("/competitions/:id", adminController.deleteCompetition);
adminRouter.post("/competitions/:id/draw", adminController.drawWinner);

// Financial Management
adminRouter.get("/withdrawals", adminController.getWithdrawals);
adminRouter.put("/withdrawals/:id/status",adminController.updateWithdrawalStatus);
adminRouter.get("/transactions", adminController.getTransactions);

// System Analytics
adminRouter.get("/analytics/overview", adminController.getSystemOverview);
adminRouter.get("/analytics/revenue", adminController.getRevenueAnalytics);
adminRouter.get("/analytics/user-growth", adminController.getUserGrowth);

// Content Management
adminRouter.get("/winners", adminController.getRecentWinners);
adminRouter.post("/winners/feature", adminController.featureWinner);

// Add to existing adminRouter

// User Verification Management
adminRouter.get("/verifications/pending",adminController.getPendingVerifications);
adminRouter.get("/verifications/:user_id", adminController.getUserVerification);
adminRouter.put("/verifications/:user_id/status", adminController.updateVerificationStatus);
adminRouter.get("/verifications", adminController.getAllVerifications);

// User Consent Management
adminRouter.get("/consents", adminController.getUserConsents);
adminRouter.get("/consents/:user_id", adminController.getUserConsentDetails);

export default adminRouter;
