import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateReleaseId, bumpVersion, buildZipCommand, isNewerVersion, loadGitignore } from "../../bare.js";
import fs from "fs";
import path from "path";
import os from "os";

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
    it("bumps patch version by default", () => {
      const pkg = { version: "1.0.0" };
      const result = bumpVersion(pkg, "patch");
      expect(result).toBe("1.0.1");
    });

    it("bumps minor version", () => {
      const pkg = { version: "1.0.0" };
      const result = bumpVersion(pkg, "minor");
      expect(result).toBe("1.1.0");
    });

    it("bumps major version", () => {
      const pkg = { version: "1.0.0" };
      const result = bumpVersion(pkg, "major");
      expect(result).toBe("2.0.0");
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

    it("applies gitignore patterns alongside ignore patterns", () => {
      const config = {
        include: [],
        ignore: [".git/*"],
        gitignore: ["node_modules/", "coverage/"],
      };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("-x '.git/*'");
      expect(result).toContain("-x 'node_modules/'");
      expect(result).toContain("-x 'coverage/'");
    });

    it("filters out distDir from gitignore patterns", () => {
      const config = {
        include: [],
        ignore: [".git/*"],
        gitignore: ["node_modules/", "dist/"],
      };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("-x 'node_modules/'");
      expect(result).not.toContain("-x 'dist/'");
    });

    it("filters out nested distDir patterns from gitignore", () => {
      const config = {
        include: [],
        ignore: [".git/*"],
        gitignore: ["node_modules/", "dist/", "dist/build/"],
      };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("-x 'node_modules/'");
      expect(result).not.toContain("-x 'dist/'");
      expect(result).not.toContain("-x 'dist/build/'");
    });

    it("works without gitignore in config", () => {
      const config = { include: [], ignore: [".git/*"] };
      const result = buildZipCommand("./dist", "archive.zip", config);

      expect(result).toContain("-x '.git/*'");
    });
  });

  describe("isNewerVersion", () => {
    it("returns true when latest is newer than current (patch)", () => {
      expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    });

    it("returns true when latest is newer than current (minor)", () => {
      expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
    });

    it("returns true when latest is newer than current (major)", () => {
      expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
    });

    it("returns false when current is newer than latest", () => {
      expect(isNewerVersion("1.0.2", "1.0.1")).toBe(false);
    });

    it("returns false when versions are equal", () => {
      expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    });

    it("handles versions with v prefix", () => {
      expect(isNewerVersion("v1.0.0", "v1.0.1")).toBe(true);
    });

    it("handles major version jump", () => {
      expect(isNewerVersion("0.9.9", "1.0.0")).toBe(true);
    });
  });

  describe("loadGitignore", () => {
    const testDir = path.join(os.tmpdir(), `bare-test-${Date.now()}`);

    beforeEach(() => {
      fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it("returns empty array when .gitignore does not exist", () => {
      const patterns = loadGitignore(testDir);
      expect(patterns).toEqual([]);
    });

    it("parses .gitignore and returns patterns", () => {
      const gitignorePath = path.join(testDir, ".gitignore");
      fs.writeFileSync(
        gitignorePath,
        `node_modules/
dist/
.env
# comment line
*.log
`,
      );

      const patterns = loadGitignore(testDir);
      expect(patterns).toContain("node_modules/");
      expect(patterns).toContain("dist/");
      expect(patterns).toContain(".env");
      expect(patterns).toContain("*.log");
      expect(patterns).not.toContain("# comment line");
    });

    it("ignores empty lines and comments", () => {
      const gitignorePath = path.join(testDir, ".gitignore");
      fs.writeFileSync(
        gitignorePath,
        `node_modules/

# This is a comment
dist/
`,
      );

      const patterns = loadGitignore(testDir);
      expect(patterns).toEqual(["node_modules/", "dist/"]);
    });
  });
});
