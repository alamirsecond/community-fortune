import { Router } from "express";
import authenticate from "../../../../middleware/authenticate.js";
import socialSharingController from "./socialRewards.controller.js";

const socialSharingRouter = Router();

socialSharingRouter.get("/test", socialSharingController.getTest);

// Share a competition and earn points
socialSharingRouter.post(
  "/share",
  authenticate(["USER", "ADMIN"]),
  socialSharingController.shareCompetition
);

// Get user's sharing statistics
socialSharingRouter.get(
  "/my-stats",
  authenticate(["USER", "ADMIN"]),
  socialSharingController.getMySharingStats
);

// Get sharing history
socialSharingRouter.get(
  "/my-history",
  authenticate(["USER", "ADMIN"]),
  socialSharingController.getMySharingHistory
);

// Admin endpoints
socialSharingRouter.get(
  "/admin/limits",
  authenticate(["ADMIN"]),
  socialSharingController.getSharingLimits
);

socialSharingRouter.post(
  "/admin/limits",
  authenticate(["ADMIN"]),
  socialSharingController.updateSharingLimits
);

socialSharingRouter.get(
  "/admin/analytics",
  authenticate(["ADMIN"]),
  socialSharingController.getSharingAnalytics
);

export default socialSharingRouter;
