import { isDeepStrictEqual } from "node:util";
import type { CapabilityArtifact, CapabilityStep, JsonValue, SurfaceRuntimeContext, ValueExpression, ValueType } from "../contracts/index.js";

export function bind(expression: ValueExpression, context: SurfaceRuntimeContext): JsonValue {
  if (expression.source === "literal") return structuredClone(expression.value);
  const values = expression.source === "input" ? context.inputs : context.outputs;
  if (!Object.hasOwn(values, expression.name)) throw new Error("Unbound value expression");
  return values[expression.name]!;
}

export function scalar(value: JsonValue): string {
  if (value === null || typeof value === "object") throw new Error("Action requires a scalar value");
  return String(value);
}

export function matchesType(value: unknown, type: ValueType): value is JsonValue {
  switch (type) {
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "currency":
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "date": return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
}

export function validateInputs(artifact: Pick<CapabilityArtifact, "inputs">, supplied: unknown): Record<string, JsonValue> {
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) throw new Error("Inputs must be an object");
  const inputs = supplied as Record<string, unknown>;
  if (Object.keys(inputs).some((key) => !artifact.inputs.some((input) => input.name === key))) {
    throw new Error("Unknown invocation input");
  }
  const result: Record<string, JsonValue> = Object.create(null);
  for (const definition of artifact.inputs) {
    if (!Object.hasOwn(inputs, definition.name)) {
      if (definition.required) throw new Error("Missing required input");
      continue;
    }
    const value = inputs[definition.name];
    if (!matchesType(value, definition.type)) throw new Error("Input type mismatch");
    const rules = definition.validation;
    if (rules && typeof value === "string") {
      if ((rules.minLength !== undefined && value.length < rules.minLength)
        || (rules.maxLength !== undefined && value.length > rules.maxLength)
        || (rules.pattern !== undefined && !new RegExp(rules.pattern).test(value))) throw new Error("Input validation failed");
    }
    if (rules && typeof value === "number"
      && ((rules.minimum !== undefined && value < rules.minimum)
        || (rules.maximum !== undefined && value > rules.maximum))) throw new Error("Input validation failed");
    result[definition.name] = structuredClone(value);
  }
  return result;
}

export function transform(value: JsonValue | undefined, kind: Extract<CapabilityStep, { action: "extract" }>["transform"]): JsonValue {
  if (value === undefined) throw new Error("Extraction returned no value");
  if (kind === "none") return value;
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Invalid extraction type");
  const text = String(value).trim();
  if (kind === "trim") return text;
  const pattern = kind === "currency_to_number"
    ? /^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/
    : kind === "integer" ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!pattern.test(text)) throw new Error("Invalid numeric extraction");
  const number = Number(text.replace(/[$,]/g, ""));
  if (!Number.isFinite(number) || (kind === "integer" && !Number.isSafeInteger(number))) throw new Error("Numeric extraction out of range");
  return number;
}

export const equalValues = isDeepStrictEqual;
