import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import settingsController from "./settings_controller.js";

const settingsRouter = Router();
const adminAuth = authenticate(["SUPERADMIN", "ADMIN"]);
const userAuth = authenticate();

// ==================== SUBSCRIPTION TIERS (USER ACCESS) ====================
settingsRouter.get(
	"/subscription-tiers",
	userAuth,
	settingsController.getSubscriptionTiers
);
settingsRouter.get(
	"/subscription-tiers/:id",
	userAuth,
	settingsController.getSubscriptionTierById
);

// All routes below require SUPERADMIN or ADMIN access
settingsRouter.use(adminAuth);

// ==================== PASSWORD SETTINGS ====================
settingsRouter.post("/password/change", settingsController.changeAdminPassword);

// ==================== MAINTENANCE MODE ====================
settingsRouter.get("/maintenance", settingsController.getMaintenanceSettings);
settingsRouter.post("/maintenance", settingsController.updateMaintenanceSettings);

// ==================== PAYMENT GATEWAY ====================
settingsRouter.get("/payment-gateways", settingsController.getPaymentGateways);
settingsRouter.get("/payment-gateways/all", settingsController.getAllGateways);
settingsRouter.post("/payment-gateways/enable", settingsController.enablePaymentGateway);
settingsRouter.post("/payment-gateways/disable", settingsController.disablePaymentGateway);
settingsRouter.post("/payment-gateways/configure", settingsController.configurePaymentGateway);
settingsRouter.get("/transaction-limits", settingsController.getTransactionLimits);
settingsRouter.post("/transaction-limits", settingsController.updateTransactionLimits);

// ==================== SECURITY & AUTHENTICATION ====================
settingsRouter.get("/security", settingsController.getSecuritySettings);
settingsRouter.post("/security", settingsController.updateSecuritySettings);

// ==================== SECRET MANAGEMENT ====================
settingsRouter.get("/secrets", settingsController.getSecrets);
settingsRouter.post("/secrets", settingsController.updateSecrets);


// ==================== SUBSCRIPTION TIERS (ADMIN CRUD) ====================
settingsRouter.post("/subscription-tiers", settingsController.createSubscriptionTier);
settingsRouter.put("/subscription-tiers/:id", settingsController.updateSubscriptionTier);
settingsRouter.delete("/subscription-tiers/:id", settingsController.deleteSubscriptionTier);


// ==================== NOTIFICATION SETTINGS ====================
settingsRouter.get("/notifications", settingsController.getNotificationSettings);
settingsRouter.get("/notifications/types", settingsController.getNotificationTypes);
settingsRouter.post("/notifications/enable", settingsController.enableNotificationType);
settingsRouter.post("/notifications/disable", settingsController.disableNotificationType);
settingsRouter.post("/notifications/email-templates", settingsController.updateEmailTemplates);

// ==================== LEGAL & COMPLIANCE ====================
settingsRouter.get("/age-verification", settingsController.getAgeVerificationSettings);
settingsRouter.post("/age-verification", settingsController.updateAgeVerificationSettings);

// ==================== CONTACT SETTINGS ====================
settingsRouter.get("/contact", settingsController.getContactSettings);
settingsRouter.post("/contact", settingsController.updateContactSettings);


// ==================== SYSTEM SETTINGS ====================
settingsRouter.get("/system", settingsController.getSystemSettings);
settingsRouter.post("/system", settingsController.updateSystemSettings);

export default settingsRouter;