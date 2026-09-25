import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { loadConfig } from "../../bare.js";

describe("loadConfig", () => {
  let testDir;
  let originalCwd;

  beforeEach(() => {
    testDir = fs.mkdtempSync("/tmp/bare-config-test-");
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  function writeConfig(config) {
    fs.writeFileSync("bare.config.json", JSON.stringify(config, null, 2));
  }

  describe("servers array (canonical)", () => {
    it("keeps servers as-is", () => {
      writeConfig({
        servers: [{ host: "a.example.com", user: "deploy", deployTo: "/srv/app" }],
        keepReleases: 3,
      });

      const config = loadConfig();

      expect(config.servers).toHaveLength(1);
      expect(config.servers[0].host).toBe("a.example.com");
      expect(config.keepReleases).toBe(3);
    });

    it("validates each server", () => {
      writeConfig({
        servers: [{ host: "a.example.com", user: "deploy", deployTo: "relative/path" }],
      });

      expect(() => loadConfig()).toThrow(/deployTo/);
    });
  });

  describe("single-server shorthand", () => {
    it("normalizes top-level server fields into servers[0]", () => {
      writeConfig({
        host: "a.example.com",
        user: "deploy",
        port: 22,
        identityFile: "~/.ssh/id_rsa",
        distDir: "./dist",
        deployTo: "/srv/app",
        webroot: "/srv/app/public_html",
        type: "node",
        ignore: [".git/*"],
        keepReleases: 3,
        healthCheck: { url: "https://a.example.com", timeout: 15 },
      });

      const config = loadConfig();

      expect(config.servers).toHaveLength(1);
      expect(config.servers[0].host).toBe("a.example.com");
      expect(config.servers[0].deployTo).toBe("/srv/app");
      expect(config.servers[0].webroot).toBe("/srv/app/public_html");
      expect(config.servers[0].ignore).toEqual([".git/*"]);
      expect(config.servers[0].keepReleases).toBeUndefined();
      expect(config.servers[0].healthCheck).toBeUndefined();
      expect(config.keepReleases).toBe(3);
      expect(config.healthCheck.url).toBe("https://a.example.com");
    });

    it("validates server fields", () => {
      writeConfig({ host: "a.example.com", deployTo: "/srv/app", type: "ruby" });

      expect(() => loadConfig()).toThrow(/type/);
    });

    it("validates absolute deployTo", () => {
      writeConfig({ host: "a.example.com", deployTo: "relative/path" });

      expect(() => loadConfig()).toThrow(/deployTo/);
    });
  });
});
