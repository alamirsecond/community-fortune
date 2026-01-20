import { z } from 'zod';

export const ContactMessageSchema = z.object({
  full_name: z.string()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Full name can only contain letters, spaces, hyphens, and apostrophes"),
  
  email: z.string()
    .email("Invalid email address")
    .max(100, "Email must be less than 100 characters"),
  
  message: z.string()
    .min(10, "Message must be at least 10 characters")
    .max(5000, "Message must be less than 5000 characters")
    .trim()
});

export const ContactResponseSchema = z.object({
  response_message: z.string()
    .min(10, "Response must be at least 10 characters")
    .max(5000, "Response must be less than 5000 characters"),
  
  status: z.enum(['IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  
  admin_notes: z.string().max(1000, "Notes must be less than 1000 characters").optional()
});

export const ContactSettingsSchema = z.object({
  setting_key: z.string().min(1).max(50),
  setting_value: z.string().max(1000)
});

export const ContactFilterSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
  category: z.enum(['GENERAL', 'SUPPORT', 'TECHNICAL', 'BILLING', 'FEEDBACK', 'COMPLAINT', 'OTHER']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20")
});