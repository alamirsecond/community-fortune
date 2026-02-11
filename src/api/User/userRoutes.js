import express from "express";
import authenticate from "../../../middleware/auth.js";
import {
  loginLimiter,
  apiLimiter,
  strictLimiter,
} from "../../../middleware/rateLimiters.js";
import userController from "./userController.js";
import { kycDocumentsUpload, handleKycUploadError } from "../../../middleware/kycUpload.js";
import { userProfileImageUpload, validateUploadedFiles, handleUploadError } from "../../../middleware/upload.js";

const router = express.Router();

// Public routes
router.post("/register",userController.registerUser);
router.post("/login",loginLimiter, userController.loginUser);

// Google OAuth sign-in (register or login)
router.post("/oauth/google",loginLimiter,userController.signInWithGoogle);
router.post("/password-reset/request",loginLimiter,userController.requestPasswordReset);
router.post("/password-reset/confirm",loginLimiter,userController.confirmPasswordReset);

//Email verification routes
router.post("/verify-email/send",loginLimiter,userController.sendVerificationEmail);
router.post("/verify-email/confirm", loginLimiter, userController.verifyEmail);

//Protected routes
router.get("/profile", authenticate(), apiLimiter, userController.getProfile);
router.put("/profile",authenticate(),apiLimiter,
  userProfileImageUpload,
  validateUploadedFiles,
  handleUploadError,
  userController.updateProfile
);
router.put("/password",authenticate(),strictLimiter,userController.changePassword);
router.get("/kyc-status",authenticate(),apiLimiter,userController.getKycStatus);

// Payment Method Routes
router.post("/payment-methods", authenticate(), apiLimiter, userController.addPaymentMethod);
router.get("/payment-methods", authenticate(), apiLimiter, userController.getPaymentMethods);
router.get("/payment-methods/:id", authenticate(), apiLimiter, userController.getPaymentMethodById);
router.put("/payment-methods/:id", authenticate(), apiLimiter, userController.updatePaymentMethod);
router.delete("/payment-methods/:id", authenticate(), apiLimiter, userController.deletePaymentMethod);


router.post("/kyc/submit",authenticate(),apiLimiter,
  kycDocumentsUpload,
  handleKycUploadError,
  userController.submitKycRequest
);

// KYC verification route
router.post(
  "/verify-age",
  authenticate(),
  apiLimiter,
  kycDocumentsUpload,
  handleKycUploadError,
  userController.verifyAge
);

// Email verification for authenticated users
router.post(
  "/verify-email/resend",
  authenticate(),
  apiLimiter,
  userController.sendVerificationEmail
);

// Email verification for authenticated users
router.post('/verify-email/resend', authenticate(), apiLimiter, userController.sendVerificationEmail);

// Referral System routes
router.post(
  "/referral/generate",
  authenticate(),
  apiLimiter,
  userController.generateReferralCode
);

router.get(
  "/referral/stats",
  authenticate(),
  apiLimiter,
  userController.getReferralStats
);
router.get(
  "/referral/link",
  authenticate(),
  apiLimiter,
  userController.getReferralLink
);
router.post(
  "/rewards/claim",
  authenticate(),
  apiLimiter,
  userController.claimReward
);

// Admin only routes
router.post(
  "/admin/create",
  authenticate(["admin"]),
  strictLimiter,
  userController.adminCreateUser
);

router.post(
  "/admin/levels/initialize",
  authenticate(["admin"]),
  strictLimiter,
  userController.adminInitializeLevels
);

export default router;
