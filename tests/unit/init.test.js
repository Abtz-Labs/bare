import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { init } from "../../bare.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testDir = path.join(__dirname, "..", "..", ".test-temp");

describe("init", () => {
  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    vi.stubGlobal("process", {
      ...process,
      cwd: () => testDir,
    });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  it("creates package.json if missing", () => {
    init();

    const pkgPath = path.join(testDir, "package.json");
    expect(fs.existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    expect(pkg.version).toBe("0.1.0");
  });

  it("exits with error if bare.config.json already exists", () => {
    const configPath = path.join(testDir, "bare.config.json");
    fs.writeFileSync(configPath, "{}");

    expect(() => init()).toThrow();
  });

  it("creates .gitignore with bare.config.json if not exists", () => {
    init();

    const gitignorePath = path.join(testDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("bare.config.json");
  });

  it("adds bare.config.json to existing .gitignore if missing", () => {
    const gitignorePath = path.join(testDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "node_modules/\n*.log\n");

    init();

    const content = fs.readFileSync(gitignorePath, "utf-8");
    expect(content).toContain("bare.config.json");
    expect(content).toContain("node_modules/");
    expect(content).toContain("*.log");
  });

  it("does not duplicate bare.config.json entry if already exists", () => {
    const gitignorePath = path.join(testDir, ".gitignore");
    fs.writeFileSync(gitignorePath, "bare.config.json\nnode_modules/\n");

    init();

    const content = fs.readFileSync(gitignorePath, "utf-8");
    const matches = content.match(/bare\.config\.json/g);
    expect(matches).toHaveLength(1);
  });

  it("creates bare.config.json with correct default config", () => {
    init();

    const configPath = path.join(testDir, "bare.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    expect(config.servers).toHaveLength(1);
    expect(config.keepReleases).toBe(5);
    expect(config.healthCheck.url).toBe("http://localhost:3000/health");
  });
});
