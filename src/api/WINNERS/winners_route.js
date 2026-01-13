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
  authenticate(["admin"]),
  winnersController.getAdminStats
);
winnersRouter.get(
  "/admin/list",
  authenticate(["admin"]),
  winnersController.getAdminList
);
winnersRouter.get(
  "/admin/export",
  authenticate(["admin"]),
  winnersController.exportAdminWinners
);
winnersRouter.post(
  "/declare",
  authenticate(["admin"]),
  winnersController.declareWinner
);
winnersRouter.post(
  "/select",
  authenticate(["admin"]),
  winnersController.selectWinners
);
winnersRouter.post(
  "/verify",
  authenticate(["admin"]),
  winnersController.verifyWinnerClaim
);

export default winnersRouter;
