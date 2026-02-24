import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateReleaseId, bumpVersion, buildZipCommand } from "../../bare.js";
import fs from "fs";
import path from "path";

describe("utils", () => {
  describe("generateReleaseId", () => {
    it("generates 14-character timestamp", () => {
      const result = generateReleaseId();
      expect(result).toMatch(/^\d{14}$/);
    });

    it("generates valid UTC timestamp format", () => {
      const result = generateReleaseId();
      const num = parseInt(result);
      expect(num).toBeGreaterThan(0);
      expect(result.length).toBe(14);
    });
  });

  describe("bumpVersion", () => {
    let originalVersion;
    const testPkgPath = path.join(process.cwd(), "package.json");

    beforeEach(() => {
      originalVersion = JSON.parse(fs.readFileSync(testPkgPath)).version;
    });

    afterEach(() => {
      const pkg = JSON.parse(fs.readFileSync(testPkgPath));
      pkg.version = originalVersion;
      fs.writeFileSync(testPkgPath, JSON.stringify(pkg, null, 2));
    });

    it("bumps patch version by default", () => {
      const result = bumpVersion("patch");
      const parts = result.split(".");
      expect(parseInt(parts[2])).toBe(parseInt(originalVersion.split(".")[2]) + 1);
    });

    it("bumps minor version", () => {
      const result = bumpVersion("minor");
      const parts = result.split(".");
      expect(parseInt(parts[1])).toBe(parseInt(originalVersion.split(".")[1]) + 1);
      expect(parts[2]).toBe("0");
    });

    it("bumps major version", () => {
      const result = bumpVersion("major");
      const parts = result.split(".");
      expect(parseInt(parts[0])).toBe(parseInt(originalVersion.split(".")[0]) + 1);
      expect(parts[1]).toBe("0");
      expect(parts[2]).toBe("0");
    });
  });

  describe("buildZipCommand", () => {
    it("creates zip command with default patterns", () => {
      const config = { include: [], ignore: [".git/*"] };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("cd ./dist");
      expect(result).toContain("zip -r ../archive.zip");
      expect(result).toContain(".");
      expect(result).toContain("-x '.git/*'");
    });

    it("creates zip command with include patterns", () => {
      const config = { include: ["*.js", "*.css"], ignore: [] };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("*.js");
      expect(result).toContain("*.css");
      expect(result).not.toContain("-x");
    });

    it("creates zip command with both include and ignore patterns", () => {
      const config = { include: ["."], ignore: [".git/*", "node_modules/*"] };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("-x '.git/*'");
      expect(result).toContain("-x 'node_modules/*'");
    });

    it("omits ignore flag when ignore patterns are empty", () => {
      const config = { include: [], ignore: [] };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).not.toContain("-x");
    });
  });
});
