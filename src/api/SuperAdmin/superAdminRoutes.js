import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import superAdminController from "./superAdminController.js";
import adminController from "../Admin/admin_controller.js";
import referralRouter from "../Referrals/referrals_routes.js";

const superAdminRouter = Router();

//Community:All superadmin routes require authentication and superadmin role
superAdminRouter.use(authenticate(["SUPERADMIN"]));
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

//Community:Admin management
superAdminRouter.post("/createAdmins",superAdminController.createAdmin);
superAdminRouter.get("/AllAdmins",superAdminController.getAdmins);
superAdminRouter.get("/getAdmin/:admin_id",superAdminController.getAdmin);
superAdminRouter.put("/updateAdmin/:admin_id",superAdminController.updateAdmin);
superAdminRouter.post("/admins/:admin_id/reset-password",superAdminController.resetAdminPassword);
superAdminRouter.get("/activity-logs",superAdminController.getActivityLogs);

//Community:Competition Management
superAdminRouter.get("/competitions", adminController.getAllCompetitions);
superAdminRouter.post("/competitions", adminController.createCompetition);
superAdminRouter.put("/competitions/:id", adminController.updateCompetition);
superAdminRouter.delete("/competitions/:id", adminController.deleteCompetition);
superAdminRouter.post("/competitions/:id/draw", adminController.drawWinner);

// User Verification Management
superAdminRouter.get("/verifications/pending",adminController.getPendingVerifications);
superAdminRouter.get("/verifications/:user_id", adminController.getUserVerification);
superAdminRouter.put("/verifications/:user_id/status", adminController.updateVerificationStatus);
superAdminRouter.get("/verifications", adminController.getAllVerifications);



export default superAdminRouter;
