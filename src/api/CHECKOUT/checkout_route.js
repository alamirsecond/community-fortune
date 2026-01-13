import express from "express";
import checkoutController from "./checkout_con.js";
const checkoutRouter = express.Router();

checkoutRouter.post(
  "/processCheckout",
  // authMiddleware,
  checkoutController.processCheckout
);
checkoutRouter.post("/webhook/cashflows", checkoutController.cashflowsWebhook);
export default checkoutRouter;
