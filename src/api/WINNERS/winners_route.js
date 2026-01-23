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
