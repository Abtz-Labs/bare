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

    it("creates package.json if missing with explanation", async () => {
      const testInitDir = fs.mkdtempSync("/tmp/bare-init-test-");
      const currentDir = process.cwd();

      try {
        process.chdir(testInitDir);
        const { init } = await import("../../bare.js");
        init();

        expect(fs.existsSync("package.json")).toBe(true);
        const pkg = JSON.parse(fs.readFileSync("package.json"));
        expect(pkg.version).toBe("0.1.0");
      } finally {
        process.chdir(currentDir);
        fs.rmSync(testInitDir, { recursive: true, force: true });
      }
    });

    it("keeps existing package.json if present", async () => {
      const testInitDir = fs.mkdtempSync("/tmp/bare-init-test-");
      const currentDir = process.cwd();

      try {
        process.chdir(testInitDir);
        fs.writeFileSync("package.json", JSON.stringify({ version: "2.0.0", name: "my-app" }, null, 2));

        const { init } = await import("../../bare.js");
        init();

        const pkg = JSON.parse(fs.readFileSync("package.json"));
        expect(pkg.version).toBe("2.0.0");
        expect(pkg.name).toBe("my-app");
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

    it("does not create previous symlink on first deploy", async () => {
      let previousSymlinkCreated = false;

      execSync.mockImplementation((cmd) => {
        if (cmd.includes("zip")) {
          return Buffer.from("");
        }
        if (cmd.includes("scp")) {
          return Buffer.from("");
        }
        if (cmd.includes("ssh")) {
          if (cmd.includes("mkdir")) return Buffer.from("");
          if (cmd.includes("unzip")) return Buffer.from("");
          if (cmd.includes("curl")) return Buffer.from("");
          if (cmd.includes("readlink") && cmd.includes("current")) {
            return Buffer.from("");
          }
          if (cmd.includes("ln -sfn") && cmd.includes("previous")) {
            previousSymlinkCreated = true;
            return Buffer.from("");
          }
          if (cmd.includes("ln -sfn")) return Buffer.from("");
          return Buffer.from("");
        }
        return Buffer.from("");
      });

      const { deploy } = await import("../../bare.js");
      await deploy();

      expect(previousSymlinkCreated).toBe(false);
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

    it("exits with error if package.json missing", async () => {
      const currentDir = process.cwd();
      const noPkgDir = fs.mkdtempSync("/tmp/bare-no-pkg-");

      try {
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
        };
        fs.writeFileSync(path.join(noPkgDir, "bare.config.json"), JSON.stringify(config, null, 2));
        process.chdir(noPkgDir);
        const { deploy } = await import("../../bare.js");
        await expect(deploy()).rejects.toThrow(/\nFile \'package\.json\' not found\.\nRun in a project directory that contains a 'package\.json' file\.\n/);
      } finally {
        process.chdir(currentDir);
        fs.rmSync(noPkgDir, { recursive: true, force: true });
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

    it("works without package.json (only needs bare.config.json)", async () => {
      const currentDir = process.cwd();
      const noPkgDir = fs.mkdtempSync("/tmp/bare-no-pkg-");

      try {
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
        };
        fs.writeFileSync(path.join(noPkgDir, "bare.config.json"), JSON.stringify(config, null, 2));
        process.chdir(noPkgDir);
        const { listReleases } = await import("../../bare.js");
        expect(() => listReleases()).not.toThrow();
      } finally {
        process.chdir(currentDir);
        fs.rmSync(noPkgDir, { recursive: true, force: true });
      }
    });
  });

  describe("use", () => {
    beforeEach(() => {
      vi.mocked(execSync).mockReset();
    });

    it("uses specified release", async () => {
      execSync.mockImplementation((cmd) => {
        if (cmd.includes("ln -sfn")) return Buffer.from("");
        return Buffer.from("");
      });

      const { use } = await import("../../bare.js");
      await use("20260220123456-v1.0.1");
    });

    it("updates previous symlink when using a release", async () => {
      let previousSymlinkUpdated = false;

      const { options } = await import("../../bare.js");
      options.dryRun = false;

      execSync.mockImplementation((cmd) => {
        if (cmd.includes("readlink") && cmd.includes("current")) {
          return Buffer.from("/var/www/app/releases/20260220150000-v1.0.2");
        }
        if (cmd.includes("ls -1") && cmd.includes("sort")) {
          return Buffer.from("20260220123456-v1.0.1\n20260220150000-v1.0.2");
        }
        if (cmd.includes("ln -sfn") && cmd.includes("/previous")) {
          previousSymlinkUpdated = true;
          return Buffer.from("");
        }
        if (cmd.includes("ln -sfn")) return Buffer.from("");
        return Buffer.from("");
      });

      const { use } = await import("../../bare.js");
      await use("20260220123456-v1.0.1");

      expect(previousSymlinkUpdated).toBe(true);

      options.dryRun = true;
    });

    it("exits with error if no version provided", async () => {
      const { use } = await import("../../bare.js");
      await expect(use()).rejects.toThrow();
    });

    it("works without package.json (only needs bare.config.json)", async () => {
      const currentDir = process.cwd();
      const noPkgDir = fs.mkdtempSync("/tmp/bare-no-pkg-");

      try {
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
        };
        fs.writeFileSync(path.join(noPkgDir, "bare.config.json"), JSON.stringify(config, null, 2));
        process.chdir(noPkgDir);
        const { use } = await import("../../bare.js");
        await expect(use("20260220123456-v1.0.1")).resolves.not.toThrow();
      } finally {
        process.chdir(currentDir);
        fs.rmSync(noPkgDir, { recursive: true, force: true });
      }
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
