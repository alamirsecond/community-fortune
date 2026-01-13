import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import pointsController from "./points_Controller.js";

const pointsRouter = Router();

//Test endpoint
pointsRouter.get("/test", pointsController.getTest);

// User endpoints - Points Management
pointsRouter.get(
  "/balance",
  authenticate(["USER", "ADMIN"]),
  pointsController.getUserPoints
);

pointsRouter.get(
  "/history",
  authenticate(["USER", "ADMIN"]),
  pointsController.getPointHistory
);

pointsRouter.post(
  "/redeem",
  authenticate(["USER", "ADMIN"]),
  pointsController.redeemPoints
);

// User endpoints - Missions
pointsRouter.get(
  "/missions",
  authenticate(["USER", "ADMIN"]),
  pointsController.getAvailableMissions
);

pointsRouter.get(
  "/missions/progress",
  authenticate(["USER", "ADMIN"]),
  pointsController.getUserMissionProgress
);

pointsRouter.post(
  "/missions/action",
  authenticate(["USER", "ADMIN"]),
  pointsController.processMissionAction
);

pointsRouter.get(
  "/missions/leaderboard",
  authenticate(["USER", "ADMIN"]),
  pointsController.getPointsLeaderboard
);

// Admin endpoints - Points Management
pointsRouter.post(
  "/award",
  authenticate(["ADMIN"]),
  pointsController.awardPoints
);

pointsRouter.get(
  "/admin/transactions",
  authenticate(["ADMIN"]),
  pointsController.getAllPointTransactions
);

pointsRouter.get(
  "/admin/user-summary/:user_id",
  authenticate(["ADMIN"]),
  pointsController.getUserPointsSummary
);

export default pointsRouter;
