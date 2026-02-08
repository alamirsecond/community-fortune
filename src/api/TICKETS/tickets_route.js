import express from "express";
import authenticate from "../../../middleware/auth.js";
import TicketSystemController from "./tickets_con.js";

const ticketRouter = express.Router();

// Allocate tickets for competition
ticketRouter.post(
  "/allocate",
  authenticate,
  TicketSystemController.allocateTickets
);

// Purchase tickets using payment module
ticketRouter.post(
  "/purchase",
  authenticate,
  TicketSystemController.purchaseTickets
);

// Get user's tickets
ticketRouter.get(
  "/my-tickets",
  authenticate,
  TicketSystemController.getUserTickets
);

// Award universal tickets (admin/internal)
ticketRouter.post(
  "/award-universal",
  authenticate,
  TicketSystemController.awardUniversalTickets
);

// Get universal tickets balance
ticketRouter.get(
  "/universal-balance",
  authenticate,
  TicketSystemController.getUniversalTicketsBalance
);

// Get competition ticket statistics
ticketRouter.get(
  "/competition/:competition_id/stats",
  authenticate,
  TicketSystemController.getCompetitionTicketStats
);

// Bulk allocate tickets for multiple competitions
ticketRouter.post(
  "/allocate-bulk",
  authenticate,
  TicketSystemController.allocateBulkTickets
);
export default ticketRouter;
