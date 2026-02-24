import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
}));

describe("CLI commands", () => {
  let testDir;
  let originalCwd;
  let originalOptions;

  beforeEach(async () => {
    const { options } = await import("../../bare.js");
    originalOptions = { ...options };
    options.dryRun = true;
    options.json = false;

    testDir = fs.mkdtempSync("/tmp/bare-test-");
    originalCwd = process.cwd();
    process.chdir(testDir);

    const config = {
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
      healthCheck: {
        url: "http://localhost:3000/health",
        timeout: 15,
      },
    };

    fs.writeFileSync("bare.config.json", JSON.stringify(config, null, 2));
    fs.mkdirSync("dist", { recursive: true });
    fs.writeFileSync("dist/index.html", "<h1>Test</h1>");
    fs.writeFileSync("package.json", JSON.stringify({ version: "1.0.0" }, null, 2));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    fs.rmSync(testDir, { recursive: true, force: true });

    const { options } = await import("../../bare.js");
    Object.assign(options, originalOptions);
  });

  describe("init", () => {
    it("creates config file in empty directory", async () => {
      const testInitDir = fs.mkdtempSync("/tmp/bare-init-test-");
      const currentDir = process.cwd();

      try {
        process.chdir(testInitDir);
        const { init } = await import("../../bare.js");
        init();

        expect(fs.existsSync("bare.config.json")).toBe(true);
        const config = JSON.parse(fs.readFileSync("bare.config.json"));
        expect(config.servers).toBeDefined();
      } finally {
        process.chdir(currentDir);
        fs.rmSync(testInitDir, { recursive: true, force: true });
      }
    });

    it("exits with error if config already exists", async () => {
      const { init } = await import("../../bare.js");
      expect(() => init()).toThrow();
    });
  });

  describe("deploy", () => {
    it("runs deploy with mocked SSH", async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("zip")) {
          return Buffer.from("");
        }
        if (cmd.includes("scp")) {
          return Buffer.from("");
        }
        if (cmd.includes("ssh")) {
          if (cmd.includes("mkdir")) return Buffer.from("");
          if (cmd.includes("ln -sfn")) return Buffer.from("");
          if (cmd.includes("unzip")) return Buffer.from("");
          if (cmd.includes("readlink")) return Buffer.from("");
          if (cmd.includes("curl")) return Buffer.from("");
          return Buffer.from("");
        }
        return Buffer.from("");
      });

      const { deploy } = await import("../../bare.js");
      await deploy();
    });

    it("exits with error if config missing", async () => {
      const currentDir = process.cwd();
      fs.rmSync("bare.config.json");

      try {
        process.chdir("/tmp");
        const { deploy } = await import("../../bare.js");
        await expect(deploy()).rejects.toThrow();
      } finally {
        process.chdir(currentDir);
      }
    });
  });

  describe("list", () => {
    it("lists releases with mocked SSH", async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("ls -1")) {
          return Buffer.from("20260220123456-v1.0.1\n20260220150000-v1.0.2");
        }
        return Buffer.from("");
      });

      const { listReleases } = await import("../../bare.js");
      listReleases();
    });
  });

  describe("rollback", () => {
    it("rolls back to specified release", async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("ln -sfn")) return Buffer.from("");
        return Buffer.from("");
      });

      const { rollback } = await import("../../bare.js");
      await rollback("20260220123456-v1.0.1");
    });

    it("exits with error if no version provided", async () => {
      const { rollback } = await import("../../bare.js");
      await expect(rollback()).rejects.toThrow();
    });
  });

  describe("cleanup", () => {
    it("cleans up old releases with mocked SSH", async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("ls -1") && cmd.includes("tail")) {
          return Buffer.from("20260220100000-v1.0.0");
        }
        if (cmd.includes("rm -rf")) return Buffer.from("");
        return Buffer.from("");
      });

      const { cleanup } = await import("../../bare.js");
      await cleanup();
    });
  });
});
