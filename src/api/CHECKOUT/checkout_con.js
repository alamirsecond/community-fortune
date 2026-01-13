import db from "../../../database.js";
import checkoutSchema from "./checkout_zod.js";
const checkoutController = {
  processCheckout: async (req, res) => {
    try {
      const { competition_id, ticket_quantity, use_credit, use_cash } =
        checkoutSchema.processCheckout.parse(req).body;
      const user_id = req.user.id;

      const [comp] = await db.query(
        `SELECT price, is_free_competition FROM competitions WHERE id = ?`,
        [competition_id]
      );
      const totalCost = comp.is_free_competition
        ? 0
        : comp.price * ticket_quantity;

      const purchase_id = uuidv4();
      let remaining = totalCost;

      // Use site credit first
      let credit_used = 0;
      if (use_credit) {
        const creditWallet = await getWallet(user_id, "CREDIT");
        credit_used = Math.min(creditWallet.balance, remaining);
        if (credit_used > 0) {
          await deductWallet(
            user_id,
            "CREDIT",
            credit_used,
            `Purchase #${purchase_id}`
          );
          remaining -= credit_used;
        }
      }

      // Then cash wallet
      let cash_used = 0;
      if (use_cash && remaining > 0) {
        const cashWallet = await getWallet(user_id, "CASH");
        cash_used = Math.min(cashWallet.balance, remaining);
        if (cash_used > 0) {
          await deductWallet(
            user_id,
            "CASH",
            cash_used,
            `Purchase #${purchase_id}`
          );
          remaining -= cash_used;
        }
      }

      // Create purchase record
      await db.query(
        `INSERT INTO purchases (id, user_id, competition_id, total_amount, site_credit_used, cash_wallet_used, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [
          purchase_id,
          user_id,
          competition_id,
          totalCost,
          credit_used,
          cash_used,
        ]
      );

      if (remaining > 0) {
        // Redirect to CashFlows payment
        const paymentUrl = await createCashFlowsPayment(remaining, purchase_id);
        return res.json({
          requires_payment: true,
          payment_url: paymentUrl,
          purchase_id,
        });
      } else {
        // Fully paid with wallets
        await finalizePurchase(purchase_id);
        res.json({ success: true, spin_eligible: true });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      throw error;
    }
  },

  cashflowsWebhook: async (req, res) => {
    try {
      const { purchase_id, status } =
        checkoutSchema.cashflowsWebhook.parse(req).body;

      if (status === "success") {
        await finalizePurchase(purchase_id);
      } else {
        await db.query(`UPDATE purchases SET status = 'FAILED' WHERE id = ?`, [
          purchase_id,
        ]);
      }
      res.json({ received: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.errors });
      }
      throw error;
    }
  },
};

export default checkoutController;
