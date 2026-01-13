import { z } from "zod";

export const ApplicationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  social_links: z.object({
    instagram: z.string().url().optional(),
    youtube: z.string().url().optional(),
    tiktok: z.string().url().optional(),
    twitter: z.string().url().optional(),
    other: z.string().url().optional(),
  }),
  audience_size: z.number().int().positive("Audience size must be positive"),
  platform: z.enum(["INSTAGRAM", "YOUTUBE", "TIKTOK", "TWITCH", "OTHER"]),
  content_examples: z.string().min(10, "Content examples are required"),
  proposal: z.string().min(20, "Proposal must be at least 20 characters"),
});

export const ApplicationStatusSchema = z.object({
  status: z.enum(["PENDING", "UNDER_REVIEW", "APPROVED", "REJECTED"]),
  admin_notes: z.string().optional(),
});

export const AssignApplicationSchema = z.object({
  admin_id: z.string().uuid("Invalid admin ID"),
});
