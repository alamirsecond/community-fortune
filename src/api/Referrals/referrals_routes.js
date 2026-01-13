import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import referralController from "./referrals_controller.js";
import referralAnalyticsController from "./referralAnalyticsController.js";
import referralSettingsController from "./referralSettingsController.js";

const referralRouter = Router();
referralRouter.use(authenticate(["SUPERADMIN", "ADMIN","USER"]));
// Test endpoint
referralRouter.get("/test", referralController.getTest);

//REFERRAL SETTINGS
referralRouter.get("/settings", referralSettingsController.getSettings);
referralRouter.get("/tiers", referralSettingsController.getTiers);
//Super Admin only routes for modification
referralRouter.post("/settings/update", referralSettingsController.updateSettings);
referralRouter.post("/tiers/:id", referralSettingsController.updateTier);
referralRouter.delete("/tiers/:id", referralSettingsController.deleteTier);
//REFERRAL ANALYTICS
referralRouter.get("/analytics/dashboard", referralAnalyticsController.getDashboardStats);
referralRouter.get("/analytics/top-referrers", referralAnalyticsController.getTopReferrers);
referralRouter.get("/analytics/detailed", referralAnalyticsController.getDetailedAnalytics);
referralRouter.get("/analytics/export", referralAnalyticsController.exportReferralData);

//REFERRAL MANAGEMENT 
// referralRouter.post("/rewards/manual", authenticate(["SUPERADMIN"]));
// referralRouter.post("/rewards/process-pending",authenticate(["SUPERADMIN"]));




// Get user's referral stats and code
referralRouter.get("/my-stats",authenticate(["USER", "ADMIN"]),referralController.getMyReferralStats);
referralRouter.get("/user/:user_id",authenticate(["USER", "ADMIN"]),referralController.getUserReferrals);
referralRouter.get("/history",authenticate(["USER", "ADMIN"]), referralController.getMyReferralHistory);

// Apply referral code during signup
referralRouter.post("/apply", referralController.applyReferralCode);

// Get referral leaderboard
referralRouter.get("/leaderboard",authenticate(["USER", "ADMIN"]),referralController.getReferralLeaderboard);
referralRouter.get("/admin/activities",authenticate(["ADMIN"]),referralController.getAllReferralActivities);

export default referralRouter;
