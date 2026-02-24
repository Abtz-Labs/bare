import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log } from "../../bare.js";

describe("logger", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("JSON mode", () => {
    it("outputs JSON with timestamp, level, and message", async () => {
      const { options: modOptions } = await import("../../bare.js");
      const originalJson = modOptions.json;
      modOptions.json = true;

      log("info", "test message");

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("test message");
      expect(parsed.timestamp).toBeDefined();

      modOptions.json = originalJson;
    });

    it("includes metadata in JSON output", async () => {
      const { options: modOptions } = await import("../../bare.js");
      const originalJson = modOptions.json;
      modOptions.json = true;

      log("info", "test message", { host: "server1.com" });

      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.host).toBe("server1.com");

      modOptions.json = originalJson;
    });
  });

  describe("colored mode", () => {
    it("outputs plain text for info level", async () => {
      const { options: modOptions } = await import("../../bare.js");
      const originalJson = modOptions.json;
      modOptions.json = false;

      log("info", "info message");

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("info message");

      modOptions.json = originalJson;
    });

    it("outputs colored text for success level", async () => {
      const { options: modOptions } = await import("../../bare.js");
      const originalJson = modOptions.json;
      modOptions.json = false;

      log("success", "done");

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("done");
      expect(output).toContain("\x1b[32m");

      modOptions.json = originalJson;
    });

    it("outputs colored text for error level", async () => {
      const { options: modOptions } = await import("../../bare.js");
      const originalJson = modOptions.json;
      modOptions.json = false;

      log("error", "failed");

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("failed");
      expect(output).toContain("\x1b[31m");

      modOptions.json = originalJson;
    });

    it("outputs colored text for warn level", async () => {
      const { options: modOptions } = await import("../../bare.js");
      const originalJson = modOptions.json;
      modOptions.json = false;

      log("warn", "warning");

      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain("warning");
      expect(output).toContain("\x1b[33m");

      modOptions.json = originalJson;
    });
  });
});
