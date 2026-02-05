import express from "express";
import winnersController from "./winners_con.js";
import authenticate from "../../../middleware/auth.js";

const winnersRouter = express.Router();

// Public routes
winnersRouter.get("/recent", winnersController.getRecentWinners);

winnersRouter.get(
  "/competition/:competition_id",
  winnersController.getCompetitionWinners
);

// Admin routes
winnersRouter.get(
  "/admin/stats",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.getAdminStats
);
winnersRouter.get(
  "/admin/list",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.getAdminList
);
winnersRouter.get(
  "/admin/export",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.exportAdminWinners
);
winnersRouter.get(
  "/admin/export/source/all",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.exportWinnersAllSources
);
winnersRouter.get(
  "/admin/export/source/main",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.exportWinnersMainSource
);
winnersRouter.get(
  "/admin/export/source/instant",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.exportWinnersInstantSource
);
winnersRouter.get(
  "/admin/export/category/jackpot",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.exportWinnersJackpotCategory
);
winnersRouter.get(
  "/admin/export/category/subscription",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.exportWinnersSubscriptionCategory
);
winnersRouter.post(
  "/declare",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.declareWinner
);
winnersRouter.post(
  "/select",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.selectWinners
);
winnersRouter.post(
  "/verify",
  authenticate(["SUPERADMIN","ADMIN"]),
  winnersController.verifyWinnerClaim
);

export default winnersRouter;
