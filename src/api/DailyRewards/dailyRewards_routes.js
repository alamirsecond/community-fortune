import { Router } from "express";
import authenticate from "../../../../middleware/authenticate.js";
import dailyRewardsController from "./dailyRewards.controller.js";

const dailyRewardsRouter = Router();

dailyRewardsRouter.get("/test", dailyRewardsController.getTest);

// User endpoints
dailyRewardsRouter.get(
  "/my-streak",
  authenticate(["USER", "ADMIN"]),
  dailyRewardsController.getMyStreak
);

dailyRewardsRouter.post(
  "/claim",
  authenticate(["USER", "ADMIN"]),
  dailyRewardsController.claimDailyReward
);

dailyRewardsRouter.get(
  "/my-rewards",
  authenticate(["USER", "ADMIN"]),
  dailyRewardsController.getMyRewardHistory
);

// Admin endpoints - Config management
dailyRewardsRouter.get(
  "/config",
  authenticate(["ADMIN"]),
  dailyRewardsController.getRewardsConfig
);

dailyRewardsRouter.post(
  "/config",
  authenticate(["ADMIN"]),
  dailyRewardsController.createRewardConfig
);

dailyRewardsRouter.put(
  "/config/:day_number",
  authenticate(["ADMIN"]),
  dailyRewardsController.updateRewardConfig
);

// Admin endpoints - User rewards management
dailyRewardsRouter.get(
  "/admin/user-rewards/:user_id",
  authenticate(["ADMIN"]),
  dailyRewardsController.getUserRewards
);

dailyRewardsRouter.get(
  "/admin/streaks",
  authenticate(["ADMIN"]),
  dailyRewardsController.getAllUserStreaks
);

export default dailyRewardsRouter;
