import { Router } from "express";
import authenticate from "../../../middleware/authenticate.js";
import partnersController from "./partners_controller.js";

const partnersRouter = Router();

// Public endpoint - submit partnership application
partnersRouter.post("/apply", partnersController.submitApplication);

// Admin endpoints
partnersRouter.get(
  "/applications",
  authenticate(["ADMIN"]),
  partnersController.getApplications
);

partnersRouter.get(
  "/applications/:id",
  authenticate(["ADMIN"]),
  partnersController.getApplication
);

partnersRouter.put(
  "/applications/:id/status",
  authenticate(["ADMIN"]),
  partnersController.updateApplicationStatus
);

partnersRouter.put(
  "/applications/:id/assign",
  authenticate(["ADMIN"]),
  partnersController.assignApplication
);

partnersRouter.get(
  "/analytics",
  authenticate(["ADMIN"]),
  partnersController.getPartnershipAnalytics
);

export default partnersRouter;
