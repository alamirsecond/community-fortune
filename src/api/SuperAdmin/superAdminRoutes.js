import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import superAdminController from "./superAdminController.js";
import adminController from "../Admin/admin_controller.js";
import referralRouter from "../Referrals/referrals_routes.js";
import {
  createCompetition,
  updateCompetition,
  bulkCreateCompetitions
} from '../Competition/competitionController.js';
import {
  competitionImagesUpload,
  competitionFeaturedUpload,
  competitionDocumentsUpload,
  bulkUploadCompetitions,
  validateUploadedFiles,
  handleUploadError
} from '../../../middleware/upload.js';
const superAdminRouter = Router();

//Community:All superadmin routes require authentication and superadmin role
superAdminRouter.use(authenticate(["SUPERADMIN","ADMIN"]));
superAdminRouter.use("/referral", referralRouter);

//Community:Supadmin Dashboard
superAdminRouter.get("/dashboard/stats",superAdminController.getDashboardStats);
superAdminRouter.get("/system-alerts", superAdminController.getAlerts);
superAdminRouter.patch("/system-alerts/:id/dismiss", superAdminController.dismissAlert);

//Community:User Management

superAdminRouter.get("/users/stats", adminController.getUserStats);
superAdminRouter.get("/users", adminController.getAllUsers);
superAdminRouter.get("/users/:user_id", adminController.getUserDetails);
superAdminRouter.put("/users/:user_id/status", adminController.updateUserStatus);
superAdminRouter.post("/users/:user_id/impersonate", adminController.impersonateUser);
superAdminRouter.delete("/users/:user_id", adminController.deleteUser);
superAdminRouter.put("/users/:user_id/deactivate", adminController.softDeleteUser); 
superAdminRouter.put("/users/:user_id/suspend", adminController.suspendUser);
superAdminRouter.put("/users/:user_id/activate", adminController.activateUser);

superAdminRouter.get('/users/export/all', adminController.exportAllUsers);
superAdminRouter.get('/users/export/active', adminController.exportActiveUsers);
superAdminRouter.get('/users/export/pending', adminController.exportPendingUsers);
superAdminRouter.get('/users/export/suspended', adminController.exportSuspendedUsers);
superAdminRouter.get('/users/export/date-range', adminController.exportByDateRange);
superAdminRouter.get('/users/export/tier-1', adminController.exportTier1Users);
superAdminRouter.get('/users/export/tier-2', adminController.exportTier2Users);
superAdminRouter.get('/users/export/tier-3', adminController.exportTier3Users);
superAdminRouter.get('/users/export/free', adminController.exportFreeUsers);
superAdminRouter.get('/users/export/detailed', adminController.exportDetailedUsers);
superAdminRouter.get('/users/export/all', adminController.exportAll);
superAdminRouter.post('/users/export/bulk', adminController.exportUsersBulk);

//Community:Admin management
superAdminRouter.get("/getAdminStats",superAdminController.getAdminStats);
superAdminRouter.post("/createAdmins",superAdminController.createAdmin);
superAdminRouter.post("/createAdmin",superAdminController.createAdmin);
superAdminRouter.get("/AllAdmins",superAdminController.getAdmins);
superAdminRouter.get("/getAdmin/:admin_id",superAdminController.getAdmin);
superAdminRouter.put("/updateAdmin/:admin_id",superAdminController.updateAdmin);
superAdminRouter.delete("deleteAdmin/:admin_id",superAdminController.deleteAdmin);
superAdminRouter.post("/admins/:admin_id/reset-password",superAdminController.resetAdminPassword);
superAdminRouter.get("/activity-logs",superAdminController.getActivityLogs);

superAdminRouter.get('/export/admins/all', adminController.exportAllAdmins);
superAdminRouter.get('/export/admins/active', adminController.exportActiveAdmins);
superAdminRouter.get('/export/admins/inactive', adminController.exportInactiveAdmins);
superAdminRouter.get('/export/admins/detailed', adminController.exportDetailedAdmins);
superAdminRouter.get('/export/admins/all', adminController.exportAll); // From your image
superAdminRouter.post('/export/admins/bulk', adminController.exportAdminsBulk);

//Community:Competition Management
superAdminRouter.get("/competitions", adminController.getAllCompetitions);
superAdminRouter.post("/competitions", adminController.createCompetition);
superAdminRouter.put("/competitions/:id", adminController.updateCompetition);
superAdminRouter.delete("/competitions/:id", adminController.deleteCompetition);
superAdminRouter.post("/competitions/:id/draw", adminController.drawWinner);



// ==================== ADMIN ROUTES ====================
//aklilu:Create competition with featured images/videos
superAdminRouter.post('/competitions', 
  authenticate(['SUPERADMIN', 'ADMIN']), 
  competitionFeaturedUpload,
  validateUploadedFiles,
  handleUploadError,
  createCompetition
);

//aklilu:Bulk create competitions from CSV
superAdminRouter.post('/bulk', 
  authenticate(['SUPERADMIN', 'ADMIN']), 
  bulkUploadCompetitions,
  validateUploadedFiles,
  handleUploadError,
  bulkCreateCompetitions
);

//aklilu:Update competition with images
superAdminRouter.put('/:id', 
  authenticate(['SUPERADMIN', 'ADMIN']), 
  competitionFeaturedUpload,
  validateUploadedFiles,
  handleUploadError,
  updateCompetition
);

//aklilu:Upload competition gallery images
superAdminRouter.post('/:id/images', 
  authenticate(['SUPERADMIN', 'ADMIN']), 
  competitionImagesUpload,
  validateUploadedFiles,
  handleUploadError,
  (req, res) => {
    res.json({
      success: true,
      message: 'Images uploaded successfully',
      data: { images: req.files }
    });
  }
);

//aklilu:Upload competition documents
superAdminRouter.post('/:id/documents', 
  authenticate(['SUPERADMIN', 'ADMIN']), 
  competitionDocumentsUpload,
  validateUploadedFiles,
  handleUploadError,
  (req, res) => {
    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: { documents: req.files }
    });
  }
);


// Community: KYC Verification Management
superAdminRouter.get("/verifications/stats", adminController.getVerificationStats);
superAdminRouter.get("/verifications/dashboard-stats", adminController.getKycDashboardStats);
superAdminRouter.get("/verifications/pending", adminController.getPendingVerifications);
superAdminRouter.get("/verifications/:user_id", adminController.getUserVerification);
superAdminRouter.put("/verifications/:user_id/status", adminController.updateVerificationStatus);
superAdminRouter.post("/verifications/bulk-update", adminController.bulkUpdateVerifications);
superAdminRouter.get("/verifications", adminController.getAllVerifications);

// KYC Export routes
superAdminRouter.get('/verifications/export/all', adminController.exportAllKYC);
superAdminRouter.get('/verifications/export/pending', adminController.exportPendingKYC);
superAdminRouter.get('/verifications/export/approved', adminController.exportApprovedKYC);
superAdminRouter.get('/verifications/export/rejected', adminController.exportRejectedKYC);
superAdminRouter.get('/verifications/export/drivers-license', adminController.exportDriversLicenseKYC);
superAdminRouter.get('/verifications/export/passport', adminController.exportPassportKYC);
superAdminRouter.get('/verifications/export/national-id', adminController.exportNationalIdKYC);
superAdminRouter.get('/verifications/export/detailed', adminController.exportDetailedKYC);
superAdminRouter.post('/verifications/export/bulk', adminController.exportKycBulk);

superAdminRouter.get("/user-consents", adminController.getUserConsents);
superAdminRouter.get("/user-consents/:user_id", adminController.getUserConsentDetails);


export default superAdminRouter;
