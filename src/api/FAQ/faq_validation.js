import { z } from "zod";

const uuid = z.string().refine(
  (value) => {
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(value);
  },
  { message: "Incorrect ID Format" }
);

export const FAQ_SCOPE = ["HOME", "SUBSCRIPTION"];

export const faqScopeSchema = z.enum(FAQ_SCOPE);

export const faqCreateSchema = z.object({
  scope: faqScopeSchema,
  question: z.string().trim().min(3, "Question too short").max(500),
  answer: z.string().trim().min(1, "Answer required").max(10000),
  is_published: z.boolean().optional().default(true),
  sort_order: z.number().int().min(1).optional(),
});

export const faqUpdateSchema = z
  .object({
    scope: faqScopeSchema.optional(),
    question: z.string().trim().min(3).max(500).optional(),
    answer: z.string().trim().min(1).max(10000).optional(),
    is_published: z.boolean().optional(),
    sort_order: z.number().int().min(1).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const faqPublishSchema = z.object({
  is_published: z.boolean(),
});

export const faqReorderSchema = z.object({
  scope: faqScopeSchema,
  ids: z.array(uuid).min(1, "ids required"),
});

export const uuidParamSchema = uuid;
