/**
 * Unit tests for actions/actionPayloadStore.ts
 */
import { describe, it, expect, afterEach, jest } from "@jest/globals";
import {
  storeActionPayload,
  retrieveActionPayload,
  deleteActionPayload,
  parseOpaqueActionValue,
  clearActionStore,
  type StoredActionPayload,
} from "../../actions/actionPayloadStore.js";
import { NotFoundError, ValidationError } from "../../core/errors.js";

type ActionPayloadInput = Omit<StoredActionPayload, "createdAt" | "verificationToken">;

const buildPayload = (): ActionPayloadInput => ({
  actionType: "manual_investigation",
  description: "Inspect failing CI tests",
  repository: "kenchi/kenchi",
  commitSha: "abc123def456",
  installationId: 42,
  priority: "medium",
  checkRunId: 1001,
});

afterEach(() => {
  clearActionStore();
  jest.useRealTimers();
});

describe("actionPayloadStore", () => {
  it("should store and retrieve payload", () => {
    const payload = buildPayload();
    const opaque = storeActionPayload(payload);

    const stored = retrieveActionPayload(opaque);

    expect(stored).toEqual(expect.objectContaining(payload));
    expect(stored.createdAt).toEqual(expect.any(Number));
    expect(stored.verificationToken).toEqual(expect.any(String));
  });

  it("should reject invalid verification token", () => {
    const payload = buildPayload();
    const opaque = storeActionPayload(payload);

    expect(() => retrieveActionPayload({ id: opaque.id, v: "bad" })).toThrow(ValidationError);
  });

  it("should expire payload after ttl", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    const payload = buildPayload();
    const opaque = storeActionPayload(payload);

    jest.advanceTimersByTime(60 * 60 * 1000 + 1);

    expect(() => retrieveActionPayload(opaque)).toThrow(NotFoundError);
  });

  it("should delete payload", () => {
    const payload = buildPayload();
    const opaque = storeActionPayload(payload);

    const wasDeleted = deleteActionPayload(opaque.id);

    expect(wasDeleted).toBe(true);
    expect(() => retrieveActionPayload(opaque)).toThrow(NotFoundError);
  });

  it("should parse opaque action value", () => {
    const payload = buildPayload();
    const opaque = storeActionPayload(payload);

    const parsed = parseOpaqueActionValue(JSON.stringify(opaque));

    expect(parsed).toEqual(opaque);
    expect(() => parseOpaqueActionValue("not json")).toThrow(ValidationError);
  });
});
