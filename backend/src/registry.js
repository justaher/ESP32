import { z } from "zod";
export const deviceDefinition = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,50}$/),
    cabinetId: z.enum(["cabinet-1", "cabinet-2"]),
    name: z.string().trim().min(1).max(100),
    type: z.enum(["light", "fan", "pump", "motor", "other"]),
    ratedPowerW: z.number().finite().positive().max(10000000),
    thresholds: z
      .object({
        minVoltage: z.number().min(0).max(1000),
        maxVoltage: z.number().positive().max(1000),
        maxCurrent: z.number().positive().max(10000),
        maxTemperature: z.number().min(-50).max(200),
      })
      .strict()
      .refine(
        (t) => t.minVoltage < t.maxVoltage,
        "minVoltage phải nhỏ hơn maxVoltage",
      ),
  })
  .strict();
