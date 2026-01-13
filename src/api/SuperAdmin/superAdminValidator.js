import { z } from "zod";

export const CreateAdminSchema = z.object({
  email: z
    .string()
    .email("Invalid email address")
    .min(5, "Email must be at least 5 characters")
    .max(100, "Email cannot exceed 100 characters"),
  first_name: z
    .string()
    .min(1, "First name is required")
    .max(50, "First name cannot exceed 50 characters"),
  last_name: z
    .string()
    .min(1, "Last name is required")
    .max(50, "Last name cannot exceed 50 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username cannot exceed 50 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    )
    .optional(),
  phone: z
    .string()
    .regex(/^[0-9+\-\s()]{10,20}$/, "Invalid phone number")
    .optional()
    .or(z.literal("")),
  permissions: z
    .object({
      manage_competitions: z.boolean().default(true),
      manage_users: z.boolean().default(false),
      view_analytics: z.boolean().default(true),
      manage_winners: z.boolean().default(true),
      manage_content: z.boolean().default(false),
      manage_settings: z.boolean().default(false),
    })
    .optional(),
});

export const UpdateAdminSchema = z.object({
  is_active: z.boolean().optional(),
  permissions: z
    .object({
      manage_competitions: z.boolean().optional(),
      manage_users: z.boolean().optional(),
      view_analytics: z.boolean().optional(),
      manage_winners: z.boolean().optional(),
      manage_content: z.boolean().optional(),
      manage_settings: z.boolean().optional(),
    })
    .optional(),
});

export const PaginationSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  search: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional().default("active"),
});

export const ActivityLogQuerySchema = PaginationSchema.extend({
  admin_id: z.string().uuid().optional(),
  action: z.string().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});
