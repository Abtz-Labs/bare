import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { execSync } from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
}));

describe("deploy version bump", () => {
  let testDir;
  let originalCwd;
  let originalOptions;
  let mockExit;

  const serverConfig = {
    servers: [
      {
        host: "test-server.example.com",
        user: "deploy",
        port: 22,
        identityFile: "~/.ssh/id_rsa",
        distDir: "./dist",
        deployTo: "/var/www/app",
        webroot: "",
        include: [],
        ignore: [".git/*"],
        preScripts: [],
        postScripts: [],
        startScript: "pm2 restart app",
      },
    ],
    keepReleases: 5,
    include: [],
    ignore: [".git/*"],
  };

  beforeEach(async () => {
    vi.mocked(execSync).mockReset();

    const { options } = await import("../../bare.js");
    originalOptions = { ...options };
    options.dryRun = false;
    options.json = false;
    options.parallel = false;

    testDir = fs.mkdtempSync("/tmp/bare-version-bump-test-");
    originalCwd = process.cwd();
    process.chdir(testDir);

    fs.writeFileSync("bare.config.json", JSON.stringify(serverConfig, null, 2));
    fs.mkdirSync("dist", { recursive: true });
    fs.writeFileSync("dist/index.html", "<h1>Test</h1>");
    fs.writeFileSync("package.json", JSON.stringify({ version: "0.1.0" }, null, 2));

    mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(async () => {
    mockExit.mockRestore();
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });

    const { options } = await import("../../bare.js");
    Object.assign(options, originalOptions);
  });

  function buildDeployMock({ hasExistingReleases = false } = {}) {
    const sshCommands = [];

    execSync.mockImplementation((cmd) => {
      if (cmd.includes("zip")) {
        const match = cmd.match(/zip -r \.\.\/([\w.-]+\.zip)/);
        if (match) fs.writeFileSync(match[1], "fake");
        return Buffer.from("");
      }
      if (cmd.includes("scp")) return Buffer.from("");

      if (cmd.includes("ssh")) {
        sshCommands.push(cmd);

        // Lock
        if (cmd.includes(".bare-deploy.lock") && cmd.includes("[ -f")) return Buffer.from("");
        if (cmd.includes("touch") && cmd.includes(".bare-deploy.lock")) return Buffer.from("");
        // mkdir
        if (cmd.includes("mkdir -p")) return Buffer.from("");
        // Unzip
        if (cmd.includes("unzip")) return Buffer.from("");
        // readlink current
        if (cmd.includes("readlink") && cmd.includes("current")) return Buffer.from("");
        // Check existing releases (auto-detection)
        if (cmd.includes("ls -1") && cmd.includes("/releases")) {
          if (hasExistingReleases) {
            return Buffer.from("20260820120000-0.1.0");
          }
          return Buffer.from("");
        }
        // Create symlinks
        if (cmd.includes("ln -sfn")) return Buffer.from("");
        // Start script
        if (cmd.includes("pm2 restart")) return Buffer.from("");
        // Lock release
        if (cmd.includes("rm -f") && cmd.includes(".bare-deploy.lock")) return Buffer.from("");

        return Buffer.from("");
      }

      return Buffer.from("");
    });

    return sshCommands;
  }

  describe("--no-bump flag", () => {
    it("skips version bump when --no-bump is set", async () => {
      buildDeployMock();

      const { options, deploy } = await import("../../bare.js");
      options.noBump = true;

      await deploy();

      const pkg = JSON.parse(fs.readFileSync("package.json"));
      expect(pkg.version).toBe("0.1.0");
    });

    it("uses current version in release ID when --no-bump is set", async () => {
      const sshCommands = buildDeployMock();

      const { options, deploy } = await import("../../bare.js");
      options.noBump = true;

      await deploy();

      const mkdirCmd = sshCommands.find((cmd) => cmd.includes("mkdir -p"));
      expect(mkdirCmd).toContain("0.1.0");
      expect(mkdirCmd).not.toContain("0.1.1");
    });
  });

  describe("auto-detection (first deploy)", () => {
    it("skips version bump when server has no existing releases", async () => {
      buildDeployMock({ hasExistingReleases: false });

      const { options, deploy } = await import("../../bare.js");
      options.noBump = false;

      await deploy();

      const pkg = JSON.parse(fs.readFileSync("package.json"));
      expect(pkg.version).toBe("0.1.0");
    });

    it("bumps version when server has existing releases", async () => {
      buildDeployMock({ hasExistingReleases: true });

      const { options, deploy } = await import("../../bare.js");
      options.noBump = false;

      await deploy();

      const pkg = JSON.parse(fs.readFileSync("package.json"));
      expect(pkg.version).toBe("0.1.1");
    });
  });

  describe("--no-bump skips SSH check", () => {
    it("does not query server for releases when --no-bump is set", async () => {
      const sshCommands = buildDeployMock({ hasExistingReleases: true });

      const { options, deploy } = await import("../../bare.js");
      options.noBump = true;

      await deploy();

      const releaseCheckCmd = sshCommands.find(
        (cmd) => cmd.includes("ls -1") && cmd.includes("/releases"),
      );
      expect(releaseCheckCmd).toBeUndefined();
    });
  });
});
