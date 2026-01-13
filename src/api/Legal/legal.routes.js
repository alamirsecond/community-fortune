import { Router } from "express";
import authenticate from "../../../../middleware/authenticate.js";
import legalController from "./legal_controller.js";

const legalRouter = Router();

legalRouter.get("/test", legalController.getTest);

legalRouter.get(
  "/all",
  authenticate(["ADMIN", "LAWYER"]),
  legalController.getAll
);

legalRouter.post(
  "/create",
  authenticate(["ADMIN"]),
  legalController.createLegalCase
);

legalRouter.get(
  "/:id",
  authenticate(["ADMIN", "LAWYER"]),
  legalController.getById
);

legalRouter.put(
  "/update/:id",
  authenticate(["ADMIN"]),
  legalController.updateLegalCase
);

legalRouter.delete(
  "/delete/:id",
  authenticate(["ADMIN"]),
  legalController.deleteLegalCase
);

export default legalRouter;
