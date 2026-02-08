import { z } from 'zod';

const allocateTickets = z.object({
  competition_id: z.string().uuid(),
  quantity: z.number().int().positive().min(1).max(100),
  use_universal_tickets: z.boolean().optional().default(false),
  payment_method: z.enum(['PAYPAL', 'CREDIT_WALLET', 'CASH_WALLET']).optional().default('CREDIT_WALLET'),
  payment_id: z.string().uuid().optional().nullable(),
  voucher_code: z.string().optional().nullable()
});

const allocateBulkTickets = z.object({
  allocations: z.array(z.object({
    competition_id: z.string().uuid(),
    quantity: z.number().int().positive().min(1).max(50)
  })).min(1).max(10),
  payment_method: z.enum(['PAYPAL', 'CREDIT_WALLET']),
  payment_id: z.string().uuid().optional().nullable(),
  voucher_code: z.string().optional().nullable()
});

const purchaseTickets = z.object({
  competition_id: z.string().uuid(),
  quantity: z.number().int().positive().min(1).max(100),
  payment_method: z.enum(['STRIPE', 'PAYPAL', 'REVOLUT', 'WALLET']).optional().default('WALLET'),
  use_wallet: z.boolean().optional().default(true)
});

export default {
  allocateTickets,
  allocateBulkTickets,
  purchaseTickets
};