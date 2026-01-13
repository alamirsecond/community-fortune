import { z } from "zod";

const uuidSchema = z.string().uuid({
  message: "Invalid UUID format",
});

const spinWheelSchemas = {
  spinRequest: z.object({
    wheel_id: uuidSchema,
    competition_id: uuidSchema.optional(),
  }),

  createWheel: z.object({
    name: z.string().min(3).max(100),
    type: z.string().min(1),
    description: z.string().max(500).optional(),
    min_tier: z.string().min(1).optional(),
    spins_per_user_period: z.string().min(1),
    max_spins_per_period: z.number().int().positive().optional(),
    cooldown_hours: z.number().int().min(1).max(168).default(24),
    background_image_url: z.string().url().optional(),
    animation_speed_ms: z.number().int().min(1000).max(10000).default(4000),
    is_active: z.boolean().default(true),
  }),

  updateWheel: z.object({
    name: z.string().min(3).max(100).optional(),
    type: z.string().min(1).optional(),
    description: z.string().max(500).optional(),
    min_tier: z.string().min(1).optional().nullable(),
    spins_per_user_period: z.string().min(1).optional(),
    max_spins_per_period: z.number().int().positive().optional().nullable(),
    cooldown_hours: z.number().int().min(1).max(168).optional(),
    background_image_url: z.string().url().optional().nullable(),
    animation_speed_ms: z.number().int().min(1000).max(10000).optional(),
    is_active: z.boolean().optional(),
  }),

  addSegment: z
    .object({
      wheel_id: uuidSchema,
      segments: z
        .array(
          z.object({
            position: z.number().int().positive(),
            color_hex: z
              .string()
              .regex(/^#[0-9A-F]{6}$/i, "Invalid hex color format"),
            prize_name: z.string().min(1).max(100),
            prize_type: z.string().min(1),
            prize_value: z.number().min(0),
            probability: z.number().min(0).max(100),
            image_url: z.string().url().optional().nullable(),
            text_color: z
              .string()
              .regex(/^#[0-9A-F]{6}$/i, "Invalid hex color format")
              .default("#FFFFFF"),
            stock: z.number().int().positive().optional().nullable(),
          })
        )
        .min(1)
        .max(100),
    })
    .refine(
      (data) => {
        const totalProb = data.segments.reduce(
          (sum, seg) => sum + seg.probability,
          0
        );
        return Math.abs(totalProb - 100) < 0.01;
      },
      {
        message: "Total probability of all segments must equal 100%",
        path: ["segments"],
      }
    )
    .refine(
      (data) => {
        const positions = data.segments.map((seg) => seg.position);
        return new Set(positions).size === positions.length;
      },
      {
        message: "Segment positions must be unique",
        path: ["segments"],
      }
    ),

  updateSegment: z.object({
    wheel_id: uuidSchema,
    segment_id: uuidSchema,
    updates: z
      .object({
        color_hex: z
          .string()
          .regex(/^#[0-9A-F]{6}$/i)
          .optional(),
        prize_name: z.string().min(1).max(100).optional(),
        prize_type: z.string().min(1).optional(),
        prize_value: z.number().min(0).optional(),
        probability: z.number().min(0).max(100).optional(),
        image_url: z.string().url().optional().nullable(),
        text_color: z
          .string()
          .regex(/^#[0-9A-F]{6}$/i)
          .optional(),
        stock: z.number().int().positive().optional().nullable(),
      })
      .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update",
      }),
  }),
};

export default spinWheelSchemas;
