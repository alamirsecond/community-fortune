import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import contactController from "./contact.controller.js";


const contactRouter = Router();

// Public routes
contactRouter.post("/submit", contactController.submitMessage);
contactRouter.get("/settings", contactController.getContactSettings);

// Admin routes
contactRouter.get(
  "/messages",
  authenticate(["ADMIN", "SUPERADMIN"]),
  contactController.getAllMessages
);

contactRouter.get(
  "/messages/stats",
  authenticate(["ADMIN", "SUPERADMIN"]),
  contactController.getMessageStatistics
);

contactRouter.get(
  "/messages/:id",
  authenticate(["ADMIN", "SUPERADMIN"]),
  contactController.getMessageById
);

contactRouter.put(
  "/messages/:id",
  authenticate(["ADMIN", "SUPERADMIN", "SUPPORT"]),
  contactController.updateMessage
);

contactRouter.post(
  "/messages/:id/respond",
  authenticate(["ADMIN", "SUPERADMIN", "SUPPORT"]),
  contactController.sendResponse
);

contactRouter.delete(
  "/messages/:id",
  authenticate(["ADMIN", "SUPERADMIN"]),
  contactController.deleteMessage
);

contactRouter.put(
  "/settings",
  authenticate(["ADMIN", "SUPERADMIN"]),
  contactController.updateContactSettings
);

// Test endpoint
contactRouter.get("/test", (req, res) => {
  res.status(200).json({ message: "Contact module is working!" });
});

export default contactRouter;