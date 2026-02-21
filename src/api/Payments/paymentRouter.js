import { Router } from "express";
import authenticate from "../../../middleware/auth.js";
import paymentController from "./payment_controller.js";
import {
  paymentMethodValidator,
  depositValidator,
  withdrawalValidator,
  refundValidator,
  gatewayConfigValidator,
  paginationValidator,
  idValidator
} from "./payment_validator.js";
import { validateWebhookSignature } from "../../../middleware/payment_middleware.js";

const paymentRouter = Router();

paymentRouter.post("/webhook/paypal", validateWebhookSignature('paypal'), paymentController.handlePayPalWebhook);
paymentRouter.post("/webhook/stripe", validateWebhookSignature('stripe'), paymentController.handleStripeWebhook);
paymentRouter.post("/webhook/revolut", validateWebhookSignature('revolut'), paymentController.handleRevolutWebhook);

paymentRouter.get("/gateways/enabled", paymentController.getEnabledGateways);

paymentRouter.use(authenticate(["USER", "ADMIN", "SUPERADMIN"]));

paymentRouter.get("/methods", paymentController.getUserPaymentMethods);
paymentRouter.post("/methods", paymentMethodValidator, paymentController.addPaymentMethod);
paymentRouter.put("/methods/:methodId", idValidator, paymentMethodValidator, paymentController.updatePaymentMethod);
paymentRouter.delete("/methods/:methodId", idValidator, paymentController.removePaymentMethod);
paymentRouter.post("/methods/:methodId/default", idValidator, paymentController.setDefaultPaymentMethod);

paymentRouter.get("/deposits", paginationValidator, paymentController.getUserDeposits);
paymentRouter.post("/deposits", depositValidator, paymentController.createDeposit);
paymentRouter.get("/deposits/:depositId", idValidator, paymentController.getDepositDetails);
paymentRouter.post("/deposits/:depositId/cancel", idValidator, paymentController.cancelDeposit);
paymentRouter.post("/deposits/:depositId/retry", idValidator, paymentController.retryDeposit);

paymentRouter.get("/withdrawals", paginationValidator, paymentController.getUserWithdrawals);

paymentRouter.get("/withdrawals/:withdrawalId", idValidator, paymentController.getWithdrawalDetails);
paymentRouter.post("/withdrawals/:withdrawalId/cancel", idValidator, paymentController.cancelWithdrawal);

paymentRouter.get("/transactions", paginationValidator, paymentController.getUserTransactions);

paymentRouter.get("/requests", paginationValidator, paymentController.getUserPaymentRequests);
paymentRouter.get("/requests/:requestId", idValidator, paymentController.getPaymentRequestDetails);

paymentRouter.use(authenticate(["ADMIN", "SUPERADMIN"]));

paymentRouter.get("/requests/all", paginationValidator, paymentController.getAllPaymentRequests);
paymentRouter.post("/requests/:requestId/approve", idValidator, paymentController.approvePaymentRequest);
paymentRouter.post("/requests/:requestId/reject", idValidator, refundValidator, paymentController.rejectPaymentRequest);
paymentRouter.post("/requests/:requestId/complete", idValidator, paymentController.completePaymentRequest);
paymentRouter.post("/requests/:requestId/refund", idValidator, refundValidator, paymentController.refundPayment);

paymentRouter.use(authenticate(["ADMIN", "SUPERADMIN", "USER"]));

paymentRouter.get("/transactions/all", paginationValidator, paymentController.getAllTransactions);
paymentRouter.get("/transactions/export/all", paymentController.exportAllTransactionsCsv);
paymentRouter.get("/transactions/export/deposits", paymentController.exportDepositTransactionsCsv);
paymentRouter.get("/transactions/export/withdrawals", paymentController.exportWithdrawalTransactionsCsv);
paymentRouter.get("/transactions/export/competition-entries", paymentController.exportCompetitionEntryTransactionsCsv);
paymentRouter.get("/transactions/export/status/all", paymentController.exportAllStatusTransactionsCsv);
paymentRouter.get("/transactions/export/status/pending", paymentController.exportPendingTransactionsCsv);
paymentRouter.get("/transactions/export/status/completed", paymentController.exportCompletedTransactionsCsv);
paymentRouter.get("/transactions/export/status/failed", paymentController.exportFailedTransactionsCsv);
paymentRouter.get("/transactions/analytics", authenticate(["ADMIN", "SUPERADMIN"]), paymentController.getTransactionAnalytics);
paymentRouter.get("/transactions/:transactionId/details", idValidator, paymentController.getTransactionDetails);
paymentRouter.post("/transactions/:transactionId/refund", idValidator, refundValidator, paymentController.refundTransaction);

paymentRouter.get("/withdrawals/all", paginationValidator, paymentController.getAllWithdrawals);
paymentRouter.post("/withdrawals/:withdrawalId/process", idValidator, paymentController.processWithdrawal);
paymentRouter.post("/withdrawals/:withdrawalId/reject", idValidator, refundValidator, paymentController.rejectWithdrawal);

paymentRouter.get("/reports/daily", paymentController.getDailyReport);
paymentRouter.get("/reports/monthly", paymentController.getMonthlyReport);
paymentRouter.get("/reports/gateway", paymentController.getGatewayReport);

paymentRouter.use(authenticate(["SUPERADMIN", "ADMIN", "USER"]));

paymentRouter.get("/gateways/config", paymentController.getGatewayConfigurations);
paymentRouter.post("/gateways/config", gatewayConfigValidator, paymentController.updateGatewayConfiguration);
paymentRouter.post("/gateways/:gateway/test", paymentController.testGatewayConnection);

paymentRouter.get("/settings", paymentController.getPaymentSettings);
paymentRouter.post("/settings", paymentController.updatePaymentSettings);
paymentRouter.post("/subscriptions", paymentController.processSubscriptionPayment);
paymentRouter.post("/tickets/purchase", paymentController.purchaseTickets);

export default paymentRouter;