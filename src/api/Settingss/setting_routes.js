import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import settingsController from "./settings_controller.js";


const settingsRouter = Router();

// All routes require SUPERADMIN or ADMIN access
settingsRouter.use(authenticate(["SUPERADMIN", "ADMIN"]));

// ==================== PASSWORD SETTINGS ====================
settingsRouter.post("/password/change", settingsController.changeAdminPassword);

// ==================== MAINTENANCE MODE ====================
settingsRouter.get("/maintenance", settingsController.getMaintenanceSettings);
settingsRouter.post("/maintenance", settingsController.updateMaintenanceSettings);

// ==================== PAYMENT GATEWAY ====================
settingsRouter.get("/payment-gateways", settingsController.getPaymentGateways);
settingsRouter.post("/payment-gateways", settingsController.updatePaymentGateways);
settingsRouter.get("/transaction-limits", settingsController.getTransactionLimits);
settingsRouter.post("/transaction-limits", settingsController.updateTransactionLimits);

// ==================== SECURITY & AUTHENTICATION ====================
settingsRouter.get("/security", settingsController.getSecuritySettings);
settingsRouter.post("/security", settingsController.updateSecuritySettings);

// ==================== SUBSCRIPTION TIERS ====================
settingsRouter.get("/subscription-tiers", settingsController.getSubscriptionTiers);
settingsRouter.get("/subscription-tiers/:id", settingsController.getSubscriptionTierById);
settingsRouter.post("/subscription-tiers", settingsController.createSubscriptionTier);
settingsRouter.put("/subscription-tiers/:id", settingsController.updateSubscriptionTier);
settingsRouter.delete("/subscription-tiers/:id", settingsController.deleteSubscriptionTier);

// ==================== NOTIFICATION SETTINGS ====================
settingsRouter.get("/notifications", settingsController.getNotificationSettings);
settingsRouter.post("/notifications", settingsController.updateNotificationSettings);

// ==================== LEGAL & COMPLIANCE ====================
settingsRouter.get("/legal", settingsController.getLegalSettings);
settingsRouter.get("/legal/:type", settingsController.getLegalDocument);
settingsRouter.post("/legal/:type", settingsController.updateLegalDocument);
settingsRouter.get("/age-verification", settingsController.getAgeVerificationSettings);
settingsRouter.post("/age-verification", settingsController.updateAgeVerificationSettings);

// ==================== CONTACT SETTINGS ====================
settingsRouter.get("/contact", settingsController.getContactSettings);
settingsRouter.post("/contact", settingsController.updateContactSettings);

// ==================== FAQ SETTINGS ====================
settingsRouter.get("/faqs", settingsController.getFaqs);
settingsRouter.get("/faqs/:scope", settingsController.getFaqsByScope);
settingsRouter.post("/faqs", settingsController.createFaq);
settingsRouter.put("/faqs/:id", settingsController.updateFaq);
settingsRouter.delete("/faqs/:id", settingsController.deleteFaq);

// ==================== VOUCHER SETTINGS ====================
settingsRouter.get("/vouchers", settingsController.getVoucherSettings);
settingsRouter.post("/vouchers", settingsController.createVoucher);
settingsRouter.put("/vouchers/:id", settingsController.updateVoucher);
settingsRouter.delete("/vouchers/:id", settingsController.deleteVoucher);

// ==================== SYSTEM SETTINGS ====================
settingsRouter.get("/system", settingsController.getSystemSettings);
settingsRouter.post("/system", settingsController.updateSystemSettings);

export default settingsRouter;