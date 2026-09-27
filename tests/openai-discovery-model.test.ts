import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIDiscoveryModel, discoveryTools } from "../src/discovery/openai-model.js";
import { memberSavingsDiscoveryRequest } from "../src/vertical-slice/discovery-request.js";
import type { SurfaceObservation } from "../src/contracts/index.js";

const observation: SurfaceObservation = { id: "snapshot", capturedAt: new Date().toISOString(), elements: [], image: { mimeType: "image/png", base64: "mock-image", redacted: false } };
const context = { request: memberSavingsDiscoveryRequest("http://localhost:3000"), actions: [], outputs: {} };

describe("OpenAI Responses adapter (mock transport)", () => {
  beforeEach(() => { vi.stubEnv("OPENAI_MODEL", undefined); });
  afterEach(() => { vi.unstubAllEnvs(); });
  it("sends strict tools, image plus structured state, medium reasoning and no storage/parallel calls", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "completed", output: [{ type: "function_call", name: "finish_discovery", arguments: "{}" }] }));
    const model = new OpenAIDiscoveryModel({ apiKey: "test-only-not-a-key", transport });
    expect(await model.decide(observation, context, new AbortController().signal)).toEqual({ kind: "finish_discovery" });
    const [endpoint, init] = transport.mock.calls[0]!;
    expect(endpoint).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gpt-6-astra", store: false, parallel_tool_calls: false, reasoning: { effort: "medium" }, tool_choice: "required" });
    expect(body.input[0].content.map((part: { type: string }) => part.type)).toEqual(["input_text", "input_image"]);
    expect(body.input[0].content[1].image_url).toBe("data:image/png;base64,mock-image");
    expect(body.tools).toHaveLength(7);
    for (const tool of discoveryTools) {
      expect(tool.strict).toBe(true); expect(tool.parameters.additionalProperties).toBe(false);
      expect(tool.parameters.required ?? []).toEqual(Object.keys(tool.parameters.properties ?? {}));
    }
    expect(body).not.toHaveProperty("previous_response_id");
  });

  it.each([
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] },
    { status: "completed", output: [{ type: "function_call", name: "finish_discovery", arguments: "{}" }, { type: "function_call", name: "finish_discovery", arguments: "{}" }] },
    { status: "completed", output: [{ type: "function_call", name: "ui_click", arguments: '{"targetRef":"x","selector":"body"}' }] },
    { status: "completed", output: [{ type: "function_call", name: "run_code", arguments: "{}" }] },
    { status: "completed", output: [{ type: "function_call", name: "finish_discovery", arguments: "null" }] },
  ])("rejects non-single or invalid model output: %j", async response => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const model = new OpenAIDiscoveryModel({ apiKey: "test-only-not-a-key", transport });
    await expect(model.decide(observation, context, new AbortController().signal)).rejects.toThrow();
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("supports model configuration and suppresses sensitive provider error bodies", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response("Sensitive provider body", { status: 401 }));
    const model = new OpenAIDiscoveryModel({ apiKey: "test-only-not-a-key", model: "test-model", transport });
    expect(model.identity.model).toBe("test-model");
    await expect(model.decide(observation, context, new AbortController().signal)).rejects.toThrow("provider_http_401");
  });
});
