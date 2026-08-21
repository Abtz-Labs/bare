import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { execSync } from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(() => ""),
}));

describe("deploy with webroot", () => {
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
        deployTo: "/home/user/web/domain",
        webroot: "/home/user/web/domain/public_html",
        include: [],
        ignore: [".git/*"],
        preScripts: [],
        postScripts: ["systemctl reload php-fpm"],
        startScript: "",
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

    testDir = fs.mkdtempSync("/tmp/bare-webroot-test-");
    originalCwd = process.cwd();
    process.chdir(testDir);

    fs.writeFileSync("bare.config.json", JSON.stringify(serverConfig, null, 2));
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

  function buildFirstDeployMock({ failAt } = {}) {
    const sshCommands = [];

    execSync.mockImplementation((cmd) => {
      if (cmd.includes("zip")) {
        // Create the dummy archive file that zip would produce
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
        // Webroot type check — is it a real dir (not a symlink)?
        // Matches both old `[ -d ... ]` and new `[ -d ... ] && [ ! -L ... ]` patterns
        if (cmd.includes("public_html") && cmd.includes('echo "dir"') && cmd.includes('echo "not-dir"')) {
          return Buffer.from("dir");
        }
        // Backup webroot
        if (cmd.includes("mv") && cmd.includes("public_html") && cmd.includes(".bak")) return Buffer.from("");
        // Unzip
        if (cmd.includes("unzip")) return Buffer.from("");
        // Is webroot a symlink? (no — it was moved to .bak)
        if (cmd.includes("[ -L") && cmd.includes("public_html")) return Buffer.from("");
        // Does backup exist?
        if (cmd.includes("public_html.bak") && cmd.includes('echo "yes"')) return Buffer.from("yes");
        // .well-known copy
        if (cmd.includes(".well-known")) return Buffer.from("");
        // readlink current (no previous on first deploy)
        if (cmd.includes("readlink") && cmd.includes("current")) return Buffer.from("");
        // Create symlinks
        if (cmd.includes("ln -sfn")) return Buffer.from("");
        // Webroot symlink creation (rm + ln)
        if (cmd.includes("rm -rf") && cmd.includes("ln -sfn")) return Buffer.from("");
        // Post-script
        if (cmd.includes("systemctl reload php-fpm")) {
          if (failAt === "post-script") {
            throw Object.assign(new Error("SSH command failed"), { stderr: Buffer.from("Connection refused") });
          }
          return Buffer.from("");
        }
        // Lock release
        if (cmd.includes("rm -f") && cmd.includes(".bare-deploy.lock")) return Buffer.from("");
        // Rollback commands (rm)
        if (cmd.includes("rm -f") || cmd.includes("rm -rf")) return Buffer.from("");

        return Buffer.from("");
      }

      return Buffer.from("");
    });

    return sshCommands;
  }

  function buildSubsequentDeployMock({ failAt } = {}) {
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
        // Webroot type check — already a symlink, not a real dir
        if (cmd.includes("public_html") && cmd.includes('echo "dir"') && cmd.includes('echo "not-dir"')) {
          return Buffer.from("not-dir");
        }
        // Unzip
        if (cmd.includes("unzip")) return Buffer.from("");
        // Is webroot a symlink? Yes, points to previous release
        if (cmd.includes("[ -L") && cmd.includes("public_html")) {
          return Buffer.from("/home/user/web/domain/releases/20260820120000-1.0.0");
        }
        // Does backup exist?
        if (cmd.includes("public_html.bak") && cmd.includes('echo "yes"')) return Buffer.from("yes");
        // .well-known copy
        if (cmd.includes(".well-known")) return Buffer.from("");
        // readlink current (has previous release)
        if (cmd.includes("readlink") && cmd.includes("current")) {
          return Buffer.from("/home/user/web/domain/releases/20260820120000-1.0.0");
        }
        // Create symlinks
        if (cmd.includes("ln -sfn")) return Buffer.from("");
        // Webroot symlink (rm + ln)
        if (cmd.includes("rm -rf") && cmd.includes("ln -sfn")) return Buffer.from("");
        // Post-script
        if (cmd.includes("systemctl reload php-fpm")) {
          if (failAt === "post-script") {
            throw Object.assign(new Error("SSH command failed"), { stderr: Buffer.from("Connection refused") });
          }
          return Buffer.from("");
        }
        // Lock release
        if (cmd.includes("rm -f") && cmd.includes(".bare-deploy.lock")) return Buffer.from("");
        // Rollback commands
        if (cmd.includes("rm -f") || cmd.includes("rm -rf")) return Buffer.from("");

        return Buffer.from("");
      }

      return Buffer.from("");
    });

    return sshCommands;
  }

  describe("first deploy - happy path", () => {
    it("creates previous symlink pointing to public_html.bak", async () => {
      const sshCommands = buildFirstDeployMock();

      const { deploy } = await import("../../bare.js");
      await deploy();

      const previousSymlinkCmd = sshCommands.find(
        (cmd) => cmd.includes("ln -sfn") && cmd.includes("public_html.bak") && cmd.includes("previous"),
      );

      expect(previousSymlinkCmd).toBeDefined();
    });
  });

  describe("first deploy - .well-known handling", () => {
    it("copies .well-known from backup when webroot no longer exists after backup", async () => {
      const sshCommands = buildFirstDeployMock();

      const { deploy } = await import("../../bare.js");
      await deploy();

      const wellKnownCmd = sshCommands.find(
        (cmd) => cmd.includes(".well-known") && cmd.includes("public_html.bak"),
      );

      expect(wellKnownCmd).toBeDefined();
    });

    it("copies .well-known from previous release on subsequent deploy", async () => {
      const sshCommands = buildSubsequentDeployMock();

      const { deploy } = await import("../../bare.js");
      await deploy();

      const wellKnownCmd = sshCommands.find(
        (cmd) => cmd.includes(".well-known") && cmd.includes("20260820120000-1.0.0"),
      );

      expect(wellKnownCmd).toBeDefined();
    });
  });

  describe("first deploy - rollback on failure", () => {
    it("restores webroot from backup when first deploy fails", async () => {
      const sshCommands = buildFirstDeployMock({ failAt: "post-script" });

      const { deploy } = await import("../../bare.js");
      await expect(deploy()).rejects.toThrow("process.exit called");

      // Restore: mv ".../public_html.bak" ".../public_html"
      // The LAST occurrence of "public_html" must NOT be "public_html.bak" (that's the destination)
      const restoreCmd = sshCommands.find((cmd) => {
        if (!cmd.includes("mv") || !cmd.includes("public_html.bak")) return false;
        const idx = cmd.lastIndexOf("public_html");
        return idx !== -1 && !cmd.substring(idx).startsWith("public_html.bak");
      });

      expect(restoreCmd).toBeDefined();
    });

    it("removes dangling webroot symlink before restoring backup", async () => {
      const sshCommands = buildFirstDeployMock({ failAt: "post-script" });

      const { deploy } = await import("../../bare.js");
      await expect(deploy()).rejects.toThrow("process.exit called");

      const removeWebrootCmd = sshCommands.find(
        (cmd) =>
          cmd.includes("rm -f") &&
          cmd.includes("public_html") &&
          !cmd.includes(".lock") &&
          !cmd.includes(".bak"),
      );

      expect(removeWebrootCmd).toBeDefined();
    });
  });

  describe("subsequent deploy - webroot already a symlink", () => {
    it("does not re-backup webroot when it is already a symlink", async () => {
      const sshCommands = buildSubsequentDeployMock();

      const { deploy } = await import("../../bare.js");
      await deploy();

      const backupCmd = sshCommands.find(
        (cmd) => cmd.includes("mv") && cmd.includes("public_html") && cmd.includes(".bak"),
      );

      expect(backupCmd).toBeUndefined();
    });
  });
});
