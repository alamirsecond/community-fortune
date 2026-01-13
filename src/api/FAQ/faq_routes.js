import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import faqController from "./faq_controller.js";

const faqRouter = Router();

// Public endpoints
faqRouter.get("/", faqController.listPublic);

// Admin endpoints (JWT required)
const ADMIN_ROLES = ["ADMIN", "SUPERADMIN", "admin", "superadmin"];
faqRouter.get("/admin", authenticate(ADMIN_ROLES), faqController.listAdmin);
faqRouter.get("/:id", authenticate(ADMIN_ROLES), faqController.getById);
faqRouter.post("/", authenticate(ADMIN_ROLES), faqController.create);
faqRouter.put("/:id", authenticate(ADMIN_ROLES), faqController.update);
faqRouter.patch(
  "/:id/publish",
  authenticate(ADMIN_ROLES),
  faqController.publish
);
faqRouter.post("/reorder", authenticate(ADMIN_ROLES), faqController.reorder);
faqRouter.delete("/:id", authenticate(ADMIN_ROLES), faqController.remove);

export default faqRouter;
