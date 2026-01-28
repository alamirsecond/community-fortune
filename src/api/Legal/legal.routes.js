import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import legalController from "./legal.controller.js";

const legalRouter = Router();



// Public endpoint to get active documents by type
legalRouter.get("/public/:type", legalController.getByType);

// Admin routes
legalRouter.get(
  "/all",
  legalController.getAll
);

legalRouter.get(
  "/types",
  legalController.getDocumentTypes
);

legalRouter.get(
  "/:id",
  legalController.getById
);

legalRouter.post(
  "/create",
  authenticate(["ADMIN", "SUPERADMIN"]),
  legalController.createLegalDocument
);

legalRouter.put(
  "/update/:id",
  authenticate(["ADMIN", "SUPERADMIN"]),
  legalController.updateLegalDocument
);

legalRouter.patch(
  "/activate/:id",
  authenticate(["ADMIN", "SUPERADMIN"]),
  legalController.setActiveDocument
);

legalRouter.delete(
  "/delete/:id",
  authenticate(["ADMIN", "SUPERADMIN"]),
  legalController.deleteLegalDocument
);

export default legalRouter;