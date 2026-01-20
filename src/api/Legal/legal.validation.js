import { z } from "zod";

const uuidValidator = z.string().refine(
  (value) => {
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(value);
  },
  { message: "Incorrect ID Format" }
);

export const LegalDocumentSchema = z.object({
  title: z.string().min(1).max(100),
  type: z.enum(['TERMS', 'PRIVACY', 'COOKIE', 'RESPONSIBLE_PLAY', 'WEBSITE_TERMS', 'OTHER']),
  content: z.string().min(1),
  version: z.string().optional(),
  isActive: z.boolean().optional()
});

export default LegalDocumentSchema;
