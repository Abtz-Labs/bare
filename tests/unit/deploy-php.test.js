import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { execSync } from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
}));

function makeServerConfig(type) {
  const server = {
    host: "test-server.example.com",
    user: "deploy",
    port: 22,
    identityFile: "~/.ssh/id_rsa",
    distDir: "./dist",
    deployTo: "/home/user/web/domain",
    webroot: "/home/user/web/domain/public_html",
    include: [],
    ignore: [".git/*"],
    preScripts: [],
    postScripts: [],
    startScript: "",
  };

  if (type !== undefined) server.type = type;

  return {
    servers: [server],
    keepReleases: 5,
    include: [],
    ignore: [".git/*"],
  };
}

describe("php deployments", () => {
  let testDir;
  let originalCwd;
  let originalOptions;
  let mockExit;

  beforeEach(async () => {
    vi.mocked(execSync).mockReset();

    const { options } = await import("../../bare.js");
    originalOptions = { ...options };
    options.dryRun = false;
    options.json = false;
    options.parallel = false;
    options.noBump = true;

    testDir = fs.mkdtempSync("/tmp/bare-php-test-");
    originalCwd = process.cwd();
    process.chdir(testDir);

    fs.mkdirSync("dist", { recursive: true });
    fs.writeFileSync("dist/index.php", "<?php echo 'Hello'; ?>");
    fs.writeFileSync("package.json", JSON.stringify({ version: "1.0.0" }, null, 2));

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

  function writeConfig(type) {
    fs.writeFileSync("bare.config.json", JSON.stringify(makeServerConfig(type), null, 2));
  }

  function buildDeployMock() {
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

        if (cmd.includes("public_html") && cmd.includes('echo "dir"')) return Buffer.from("dir");
        if (cmd.includes("public_html.bak") && cmd.includes('echo "yes"')) return Buffer.from("yes");
        if (cmd.includes("[ -L") && cmd.includes("public_html")) return Buffer.from("");

        return Buffer.from("");
      }

      return Buffer.from("");
    });

    return sshCommands;
  }

  describe("buildPhpUserIniCommand", () => {
    it("writes opcache.revalidate_path=1 to .user.ini in the release", async () => {
      const { buildPhpUserIniCommand } = await import("../../bare.js");
      const cmd = buildPhpUserIniCommand("/home/user/web/domain/releases/123-1.0.0");

      expect(cmd).toContain("/home/user/web/domain/releases/123-1.0.0/.user.ini");
      expect(cmd).toContain("opcache.revalidate_path=1");
    });
  });

  describe("deploy with type: php", () => {
    it("configures .user.ini on the server", async () => {
      writeConfig("php");
      const sshCommands = buildDeployMock();

      const { deploy } = await import("../../bare.js");
      await deploy();

      const userIniCmd = sshCommands.find((cmd) => cmd.includes(".user.ini"));

      expect(userIniCmd).toBeDefined();
      expect(userIniCmd).toContain("opcache.revalidate_path=1");
    });
  });

  describe("deploy without type", () => {
    it("does not configure .user.ini", async () => {
      writeConfig(undefined);
      const sshCommands = buildDeployMock();

      const { deploy } = await import("../../bare.js");
      await deploy();

      const userIniCmd = sshCommands.find((cmd) => cmd.includes(".user.ini"));

      expect(userIniCmd).toBeUndefined();
    });
  });

  describe("config validation", () => {
    it("throws on unsupported type", async () => {
      writeConfig("ruby");

      const { loadConfig } = await import("../../bare.js");
      expect(() => loadConfig()).toThrow(/type/);
    });

    it("accepts type: node", async () => {
      writeConfig("node");

      const { loadConfig } = await import("../../bare.js");
      expect(() => loadConfig()).not.toThrow();
    });
  });
});
