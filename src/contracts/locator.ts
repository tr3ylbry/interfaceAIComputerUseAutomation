import { z } from "zod";
import { IdentifierSchema } from "./common.js";

const LocatorBaseSchema = z.object({
  id: IdentifierSchema.optional(),
  description: z.string().min(1).optional(),
});

export const AccessibilityLocatorSchema = LocatorBaseSchema.extend({
  kind: z.literal("accessibility"),
  role: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  exact: z.boolean().default(true),
}).refine((value) => value.role || value.name, {
  message: "accessibility locator requires role and/or accessible name",
});

export const LabelLocatorSchema = LocatorBaseSchema.extend({
  kind: z.literal("label"),
  label: z.string().min(1),
  exact: z.boolean().default(true),
});

export const TextLocatorSchema = LocatorBaseSchema.extend({
  kind: z.literal("text"),
  text: z.string().min(1),
  exact: z.boolean().default(true),
});

export const SelectorLocatorSchema = LocatorBaseSchema.extend({
  kind: z.literal("selector"),
  engine: z.enum(["css", "xpath"]),
  selector: z.string().min(1),
});

export const CoordinateLocatorSchema = LocatorBaseSchema.extend({
  kind: z.literal("coordinate"),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  referenceFrame: z.enum(["viewport", "window", "screen"]),
  expectedWidth: z.number().positive().optional(),
  expectedHeight: z.number().positive().optional(),
});

export const RelativeLocatorSchema = LocatorBaseSchema.extend({
  kind: z.literal("relative"),
  anchorText: z.string().min(1),
  relation: z.enum(["following", "preceding", "within", "nearest"]),
  controlHint: z.string().min(1).optional(),
  ordinal: z.number().int().positive().default(1),
});

export const LocatorStrategySchema = z.discriminatedUnion("kind", [
  AccessibilityLocatorSchema,
  LabelLocatorSchema,
  TextLocatorSchema,
  RelativeLocatorSchema,
  SelectorLocatorSchema,
  CoordinateLocatorSchema,
]);

export type LocatorStrategy = z.infer<typeof LocatorStrategySchema>;

export const TargetDescriptorSchema = z.object({
  id: IdentifierSchema,
  description: z.string().min(1),
  strategies: z.array(LocatorStrategySchema).min(1),
  framePath: z.array(z.string().min(1)).optional(),
  notes: z.string().optional(),
});

export type TargetDescriptor = z.infer<typeof TargetDescriptorSchema>;
