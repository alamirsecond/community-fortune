import express from "express";
import { z } from "zod";

const checkoutSchema = {
  processCheckout: z.object({
    body: z.object({
      competition_id: z.string().uuid("Competition ID must be a valid UUID"),
      ticket_quantity: z
        .number()
        .int()
        .positive("Ticket quantity must be a positive integer"),
      use_credit: z.boolean().optional().default(false),
      use_cash: z.boolean().optional().default(false),
    }),
  }),
  cashflowsWebhook: z.object({
    body: z.object({
      purchase_id: z.string().uuid("Purchase ID must be a valid UUID"),
      status: z.enum(["success", "failed", "cancelled"], {
        errorMap: () => ({
          message: "Status must be 'success', 'failed', or 'cancelled'",
        }),
      }),
    }),
  }),
};
export default checkoutSchema;
