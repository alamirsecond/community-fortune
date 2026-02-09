import { z } from "zod";

const VoucherTypeEnum = z.enum(["SINGLE_REDEMPTION", "MULTI_REDEMPTION"]);
const RewardTypeEnum = z.enum(["SITE_CREDIT","PERCENTAGE_DISCOUNT", "FREE_ENTRY_TICKETS","COMPETITION_ENTRY"]);

const VoucherCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z0-9]{4,32}$/.test(v), {
    message: "Voucher code must be 4-32 chars (A-Z, 0-9)",
  });

const DateInputSchema = z
  .string()
  .trim()
  .min(1, "Date is required")
  .refine(
    (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v),
    {
      message: "Date must be YYYY-MM-DD or DD/MM/YYYY",
    }
  );

export const CreateVoucherSchema = z
  .object({
    code: z
      .string()
      .optional()
      .transform((v) => (typeof v === "string" ? v.trim() : ""))
      .refine((v) => v === "" || /^[A-Za-z0-9]{4,32}$/.test(v), {
        message: "Code must be blank or 4-32 alphanumeric characters",
      })
      .transform((v) => v.toUpperCase()),
    campaign_name: z.string().trim().min(2).max(255),
    voucher_type: VoucherTypeEnum.default("SINGLE_USE"),
    reward_type: RewardTypeEnum.default("SITE_CREDIT"),
    reward_value: z.coerce.number().positive().max(1000000),
    start_date: DateInputSchema,
    expiry_date: DateInputSchema,
    usage_limit: z.coerce.number().int().min(0).default(1),
    code_prefix: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (typeof v === "string" ? v.toUpperCase() : undefined)),
    bulk_quantity: z.coerce.number().int().min(0).default(0),
    bulk_code_length: z.coerce.number().int().min(4).max(32).default(8),
  })
  .superRefine((data, ctx) => {
    if (data.voucher_type === "SINGLE_USE" && data.usage_limit !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usage_limit"],
        message: "Single-use vouchers must have usage_limit = 1",
      });
    }

    if (data.voucher_type === "BULK_CODES") {
      if (data.bulk_quantity < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bulk_quantity"],
          message: "Bulk vouchers need at least 1 code",
        });
      }

      if (
        data.usage_limit &&
        data.usage_limit > 0 &&
        data.usage_limit !== data.bulk_quantity
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["usage_limit"],
          message: "For bulk vouchers usage_limit should match bulk_quantity",
        });
      }
    }
  });

export const UpdateVoucherSchema = z
  .object({
    campaign_name: z.string().trim().min(2).max(255).optional(),
    voucher_type: VoucherTypeEnum.optional(),
    reward_type: RewardTypeEnum.optional(),
    reward_value: z.coerce.number().positive().max(1000000).optional(),
    start_date: DateInputSchema.optional(),
    expiry_date: DateInputSchema.optional(),
    usage_limit: z.coerce.number().int().min(0).optional(),
    is_active: z.boolean().optional(),
    code_prefix: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (typeof v === "string" ? v.toUpperCase() : undefined)),
    bulk_quantity: z.coerce.number().int().min(0).optional(),
    bulk_code_length: z.coerce.number().int().min(4).max(32).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.voucher_type === "SINGLE_USE" &&
      data.usage_limit !== undefined &&
      data.usage_limit !== 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["usage_limit"],
        message: "Single-use vouchers must have usage_limit = 1",
      });
    }

    if (data.voucher_type === "BULK_CODES") {
      if (data.bulk_quantity !== undefined && data.bulk_quantity < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bulk_quantity"],
          message: "Bulk vouchers need at least 1 code",
        });
      }
    }
  });

export const AdminListVouchersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  is_active: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true"))
    .refine((v) => v === undefined || typeof v === "boolean", {
      message: "is_active must be true/false",
    })
    .optional(),
  status: z.enum(["active", "expired", "scheduled", "inactive"]).optional(),
  type: VoucherTypeEnum.optional(),
  sort: z
    .enum(["latest", "value_desc", "expiry_asc", "usage_desc", "usage_asc"])
    .default("latest"),
});

export const ValidateVoucherSchema = z.object({
  code: VoucherCodeSchema,
});

export const RedeemVoucherSchema = z.object({
  code: VoucherCodeSchema,
});
