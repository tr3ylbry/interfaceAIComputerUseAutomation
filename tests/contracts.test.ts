import { describe, expect, it } from "vitest";
import {
  CapabilityArtifactSchema,
  SessionControlState,
  canTransitionControl,
} from "../src/contracts/index.js";
import fixture from "../examples/member-savings-balance.capability.json" with { type: "json" };

describe("CapabilityArtifact", () => {
  it("accepts the example serialized artifact", () => {
    const result = CapabilityArtifactSchema.safeParse(fixture);
    expect(result.success).toBe(true);
  });

  it("requires version 1.1 for safety conditions while accepting older artifacts without them", () => {
    expect(CapabilityArtifactSchema.safeParse({ ...fixture, schemaVersion: "1.0" }).success).toBe(false);
    expect(CapabilityArtifactSchema.safeParse({ ...fixture, schemaVersion: "1.0", runtimeConditions: [] }).success).toBe(true);
  });
});

describe("human control state machine", () => {
  const automation: SessionControlState = {
    state: "automation_running",
    owner: "automation",
    epoch: 0,
  };

  const paused: SessionControlState = {
    state: "paused_for_intervention",
    owner: "none",
    epoch: 1,
    interventionId: "intervention-1",
  };

  const human: SessionControlState = {
    state: "human_control",
    owner: "human",
    epoch: 2,
    interventionId: "intervention-1",
    grantedAt: "2026-09-27T18:00:00.000Z",
  };

  it("allows the intended automation → pause → human path", () => {
    expect(canTransitionControl(automation, paused)).toBe(true);
    expect(canTransitionControl(paused, human)).toBe(true);
  });

  it("does not allow automation to jump directly into human control", () => {
    expect(canTransitionControl(automation, human)).toBe(false);
  });
});
