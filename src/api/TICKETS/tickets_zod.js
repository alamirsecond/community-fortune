import { z } from "zod";

const ticketSchemas = {
  allocateTickets: z.object({
    competition_id: z.string().uuid(),
    quantity: z.number().int().positive().max(100),
    use_universal_tickets: z.boolean().default(false),
    purchase_id: z.string().uuid().optional(),
    payment_method: z.string().optional(),
  }),

  useUniversalTicket: z.object({
    competition_id: z.string().uuid(),
    universal_ticket_ids: z.array(z.string().uuid()).optional(),
  }),
};

export default ticketSchemas;
