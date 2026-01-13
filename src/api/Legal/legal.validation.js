import { z } from "zod";

const uuidValidator = z.string().refine(
  (value) => {
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(value);
  },
  { message: "Incorrect ID Format" }
);

export const LegalSchema = z.object({
  title: z.string().min(3, "Title too short"),
  description: z.string().min(5, "Description too short"),
  lawyer_id: uuidValidator,
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]),
});

export default LegalSchema;
