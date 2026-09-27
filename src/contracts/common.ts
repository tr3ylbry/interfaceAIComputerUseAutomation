import { z } from "zod";

export const IdentifierSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "must be a stable machine-readable identifier");

export type Identifier = z.infer<typeof IdentifierSchema>;

export const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JsonPrimitive = z.infer<typeof JsonPrimitiveSchema>;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const ValueTypeSchema = z.enum([
  "string",
  "integer",
  "number",
  "boolean",
  "date",
  "currency",
]);

export type ValueType = z.infer<typeof ValueTypeSchema>;

export const ValueExpressionSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("literal"),
    value: JsonValueSchema,
  }),
  z.object({
    source: z.literal("input"),
    name: IdentifierSchema,
  }),
  z.object({
    source: z.literal("output"),
    name: IdentifierSchema,
  }),
]);

export type ValueExpression = z.infer<typeof ValueExpressionSchema>;

export const RiskClassSchema = z.enum([
  "read_only",
  "reversible_write",
  "irreversible_write",
]);

export type RiskClass = z.infer<typeof RiskClassSchema>;

export const EvidenceRefSchema = z.object({
  kind: z.enum(["screenshot", "trace", "dom_snapshot", "accessibility_snapshot", "log"]),
  path: z.string().min(1),
  capturedAt: z.string().datetime(),
  redacted: z.boolean().default(true),
});

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
