import express from "express";
import authenticate from "../../../middleware/auth.js";
import InstantWinController from "./instantWins_con.js";
import pool from "../../../database.js";

const instantWinsRouter = express.Router();

const ADMIN_ROLES = ["ADMIN", "admin", "SUPERADMIN", "superadmin"];

// Existing routes
instantWinsRouter.post(
  "/admin/instant-wins",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.createInstantWins
);

// ADMIN: Reports + Analytics + Exports
instantWinsRouter.get(
  "/admin/reports",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.adminInstantWinReports
);

instantWinsRouter.get(
  "/admin/analytics",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.adminInstantWinAnalytics
);

instantWinsRouter.get(
  "/admin/export",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.adminExportAllInstantWinsCsv
);

instantWinsRouter.get(
  "/admin/competition/:competition_id",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.adminGetCompetitionInstantWins
);

instantWinsRouter.get(
  "/admin/competition/:competition_id/report",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.adminCompetitionReport
);

instantWinsRouter.get(
  "/admin/competition/:competition_id/export",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.adminExportCompetitionInstantWinsCsv
);

instantWinsRouter.get(
  "/competition/:competition_id",
  authenticate,
  InstantWinController.getCompetitionInstantWins
);

instantWinsRouter.get(
  "/my-wins",
  authenticate,
  InstantWinController.getUserInstantWins
);

// NEW ROUTES FOR MANUAL OPERATIONS
instantWinsRouter.post(
  "/admin/instant-wins/manual",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.createInstantWinManually
);

instantWinsRouter.patch(
  "/admin/instant-wins/claim-status",
  authenticate,
  authenticate(ADMIN_ROLES),
  InstantWinController.updateClaimedStatus
);

// Existing claim route
instantWinsRouter.post(
  "/:instant_win_id/claim",
  authenticate,
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const result = await InstantWinController.processInstantWinClaim(
        connection,
        req.params.instant_win_id,
        req.user.id,
        req.body.user_details || {}
      );
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    } finally {
      connection.release();
    }
  }
);

export default instantWinsRouter;
