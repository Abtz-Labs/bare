#!/usr/bin/env node

/**
 * Atomic SSH Deployment CLI
 * - Key-based SSH only (no password fallback)
 * - Atomic releases
 * - Zero downtime
 * - Parallel deploy
 * - Dry run
 * - JSON logging
 * - Health check
 * - Remote lock file
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const pkgPath = path.join(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath));

// ------------------------------
// CLI ARGUMENTS
// ------------------------------

const args = process.argv.slice(2);
const command = args[0];

const options = {
  dryRun: args.includes("--dry-run"),
  json: args.includes("--json"),
  parallel: !args.includes("--sequential"),
  versionBump: args.includes("--major") ? "major" : args.includes("--minor") ? "minor" : "patch",
  queryVersion: args.includes("--version") || args.includes("-v"),
};

// ------------------------------
// LOGGER
// ------------------------------

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
};

function log(level, message, meta = {}) {
  if (options.json) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...meta,
      }),
    );

    return;
  }

  let color = colors.reset;

  if (level === "success") {
    color = colors.green;
  } else if (level === "error") {
    color = colors.red;
  } else if (level === "warn") {
    color = colors.yellow;
  }

  console.log(`${color}${message}${colors.reset}`);
}

// ------------------------------
// CONFIG
// ------------------------------

function loadConfig() {
  const file = path.join(process.cwd(), "bare.config.json");

  if (!fs.existsSync(file)) {
    log("error", "bare.config.json not found.");
    process.exit(1);
  }

  return JSON.parse(fs.readFileSync(file));
}

// ------------------------------
// SSH HELPERS (KEY-ONLY)
// ------------------------------

function buildSSHBase(server) {
  const port = server.port || 22;
  const identity = server.identityFile ? `-i ${server.identityFile}` : "";

  return `ssh -p ${port} ${identity} \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new \
    ${server.user}@${server.host}`;
}

function buildSCPBase(server) {
  const port = server.port || 22;
  const identity = server.identityFile ? `-i ${server.identityFile}` : "";

  return `scp -P ${port} ${identity} \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new`;
}

function runLocal(cmd, description) {
  const message = description || `Executing: ${cmd}`;
  log("info", message);

  if (options.dryRun) return;

  try {
    return execSync(cmd, { stdio: "pipe" }).toString().trim();
  } catch (err) {
    log("error", `Local command failed: ${description || cmd}`);
    // Create a clean error without exposing the full command or stderr
    const cleanError = new Error(`Local command failed: ${description || cmd}`);
    throw cleanError;
  }
}

function runSSH(server, cmd, description) {
  const base = buildSSHBase(server);
  const fullCmd = `${base} '${cmd}'`;

  if (description) {
    log("info", `${description}...`);
  }

  if (options.dryRun) return;

  try {
    return execSync(fullCmd, { stdio: "pipe" }).toString().trim();
  } catch (err) {
    // Only log error if no description is provided (to avoid duplicate messages)
    if (!description) {
      log("error", `Command failed on ${server.host}`);
    }
    // Create a clean error without exposing the full command or stderr
    const cleanError = new Error(`SSH command failed on ${server.host}`);
    cleanError.host = server.host;
    cleanError.description = description;
    throw cleanError;
  }
}

function scpTo(server, localFile, remotePath) {
  const base = buildSCPBase(server);
  const fullCmd = `${base} ${localFile} ${server.user}@${server.host}:${remotePath}`;

  log("info", `Uploading package...`);

  if (options.dryRun) return;

  try {
    execSync(fullCmd, { stdio: "pipe" });
    log("success", `Package uploaded successfully!`);
  } catch (err) {
    log("error", `Upload failed to ${server.host}`);
    // Create a clean error without exposing the full command or stderr
    const cleanError = new Error(`Upload failed to ${server.host}`);
    cleanError.host = server.host;
    throw cleanError;
  }
}

// ------------------------------
// UTILS
// ------------------------------

function generateReleaseId() {
  const now = new Date();

  // Use UTC timestamp to avoid conflicts when deploying from different timezones
  // Format: YYYYMMDDHHmmss (e.g., 20260220162341)
  return now
    .toISOString()
    .replace(/[-:T.]/g, "")
    .slice(0, 14);
}

function bumpVersion(type = "patch") {
  const parts = pkg.version.split(".").map((n) => parseInt(n));

  if (type === "major") {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (type === "minor") {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    // patch
    parts[2] += 1;
  }

  const newVersion = parts.join(".");

  if (!options.dryRun) {
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  log("success", `Version bumped to ${newVersion} (${type})`);

  return newVersion;
}

function buildZipCommand(distDir, archive, config) {
  const includePatterns = config.include || [];
  const ignorePatterns = config.ignore || [".git/*"];

  let zipCmd = `cd ${distDir} && zip -r ../${archive}`;

  if (includePatterns.length > 0) {
    // If include patterns are specified, only zip those patterns
    const patterns = includePatterns.join(" ");
    zipCmd += ` ${patterns}`;
  } else {
    zipCmd += ` .`;
  }

  if (ignorePatterns.length > 0) {
    // If ignore patterns are specified, attempt to exclude these
    const excludes = ignorePatterns.map((pattern) => `-x '${pattern}'`).join(" ");
    zipCmd += ` ${excludes}`;
  }

  return zipCmd;
}

function copyWellKnown(server, sourceDir, targetDir) {
  const cmd = `
    if [ -d "${sourceDir}/.well-known" ]; then
      mkdir -p "${targetDir}/.well-known" &&
      cp -r "${sourceDir}/.well-known/"* "${targetDir}/.well-known/" 2>/dev/null || echo "Warning: Failed to copy .well-known"
    fi
  `;
  try {
    runSSH(server, cmd, "Copying .well-known for Let's Encrypt");
  } catch (err) {
    log("warn", `.well-known copy failed, continuing anyway: ${err.message}`);
  }
}

// ------------------------------
// DEPLOY
// ------------------------------

async function deploy() {
  const config = loadConfig();
  const startTime = Date.now();

  const version = bumpVersion(options.versionBump);
  const releaseId = `${generateReleaseId()}-${version}`;

  const deployToServer = async (server) => {
    // Run preScripts locally for this server
    for (const script of server.preScripts || []) {
      runLocal(script);
    }

    // Create zip for this server's distDir
    const archive = `${releaseId}.${server.host}.zip`;
    const distDir = server.distDir || ".";
    const zipCommand = buildZipCommand(distDir, archive, config);
    runLocal(zipCommand, `Creating deployment package for ${server.host}...`);

    const base = server.deployTo;
    const releaseBase = `${base}/releases`;
    const releaseDir = `${releaseBase}/${releaseId}`;
    const lockFile = `${base}/.deploy.lock`;

    log("info", `Deploying to ${server.host}...`);

    try {
      // Lock protection
      runSSH(server, `if [ -f ${lockFile} ]; then echo "Deploy locked"; exit 1; fi`, "Checking deployment lock");
      runSSH(server, `touch ${lockFile}`, "Acquiring deployment lock");

      // Handle webroot migration (first deploy: if webroot is a directory, backup it)
      if (server.webroot) {
        const isDir = runSSH(server, `[ -d "${server.webroot}" ] && echo "dir" || echo "not-dir"`, "Checking webroot type");
        if (isDir === "dir") {
          runSSH(server, `mv "${server.webroot}" "${server.webroot}.bak"`, "Backing up original webroot");
        }
      }

      scpTo(server, archive, `${releaseDir}/${archive}`);

      runSSH(
        server,
        `
        mkdir -p ${base}/releases &&
        mkdir -p ${releaseDir} &&
        unzip -q ${releaseDir}/${archive} -d ${releaseDir} &&
        rm -f ${releaseDir}/${archive}
      `,
        "Extracting deployment package",
      );

      // Copy .well-known for Let's Encrypt before switching
      if (server.webroot) {
        // Get previous webroot target
        const previousWebrootTarget = runSSH(
          server,
          `[ -L "${server.webroot}" ] && readlink -f "${server.webroot}" || echo ""`,
          "Getting previous webroot target",
        );

        // Check for backup from first deploy
        const backupExists = runSSH(
          server,
          `[ -d "${server.webroot}.bak" ] && echo "yes" || echo "no"`,
          "Checking for webroot backup",
        );

        if (previousWebrootTarget && previousWebrootTarget.includes(releaseBase)) {
          // Subsequent deploy: copy from previous release
          const previousRelease = previousWebrootTarget.split("/").pop();
          const prevReleaseDir = `${releaseBase}/${previousRelease}`;
          copyWellKnown(server, prevReleaseDir, releaseDir);
        } else if (backupExists === "yes") {
          // First deploy: copy from backup
          copyWellKnown(server, `${server.webroot}.bak`, releaseDir);
        }
        // If neither exists, skip silently
      }

      // Capture previous release for potential rollback
      const previousRelease = runSSH(
        server,
        `readlink ${releaseBase}/current 2>/dev/null || echo ""`,
        "Capturing previous release",
      );

      // Update symlink BEFORE running postScripts so they operate on the new release
      runSSH(server, `ln -sfn ${releaseDir} ${releaseBase}/current`, "Activating new release");

      // Handle webroot symlink
      if (server.webroot) {
        // Remove old webroot if exists (symlink or directory)
        runSSH(server, `rm -rf "${server.webroot}" 2>/dev/null || true`, "Removing old webroot");
        // Create new webroot symlink
        runSSH(server, `ln -sfn ${releaseBase}/current "${server.webroot}"`, "Creating webroot symlink");
      }

      for (const script of server.postScripts || []) {
        runSSH(server, `cd ${releaseBase}/current && ${script}`, "Running post-deployment script");
      }

      if (server.startScript) {
        runSSH(server, `cd ${releaseBase}/current && ${server.startScript}`, "Running start script");
      }

      if (config.healthCheck?.url) {
        runSSH(
          server,
          `
          timeout ${config.healthCheck.timeout || 15} \
          curl -f ${config.healthCheck.url}
        `,
          "Running health check",
        );
      }

      runSSH(server, `rm -f ${lockFile}`, "Releasing deployment lock");

      if (!options.dryRun) fs.unlinkSync(archive);

      log("success", `Deploy successful on ${server.host}!`);
    } catch (err) {
      log("error", `Deploy failed on ${server.host}`);

      try {
        // Attempt rollback if there was a previous release
        if (previousRelease && previousRelease.trim() !== "") {
          log("warn", "Attempting rollback to previous release...");

          // Revert symlink to previous release
          runSSH(server, `ln -sfn ${previousRelease} ${releaseBase}/current`, "Reverting symlink to previous release");

          // Re-run postScripts to restart the old version
          if (server.postScripts && server.postScripts.length > 0) {
            log("info", "Restarting previous release...");
            for (const script of server.postScripts) {
              try {
                runSSH(server, `cd ${releaseBase}/current && ${script}`, "Running post-script for previous release");
              } catch (scriptErr) {
                log("warn", `Failed to run post-script during rollback: ${script}`);
              }
            }
          }

          // Re-run startScript for rollback
          if (server.startScript) {
            try {
              runSSH(server, `cd ${releaseBase}/current && ${server.startScript}`, "Running start script for previous release");
            } catch (scriptErr) {
              log("warn", `Failed to run start script during rollback: ${server.startScript}`);
            }
          }

          // Health check the previous release to confirm it's healthy
          if (config.healthCheck?.url) {
            try {
              runSSH(
                server,
                `
                timeout ${config.healthCheck.timeout || 15} \
                curl -f ${config.healthCheck.url}
              `,
                "Verifying previous release health",
              );
              log("success", "Rollback successful - previous release is healthy");
            } catch (healthErr) {
              log("error", "WARNING: Previous release health check failed after rollback!");
            }
          } else {
            log("success", "Rollback completed");
          }
        } else {
          log("error", "First deployment failed - no previous release to revert to");
          log("info", "Check your application logs and configuration, then try deploying again");
        }

        // Clean up failed release directory
        runSSH(server, `rm -rf ${releaseDir} || true`, "Cleaning up failed deployment");
        runSSH(server, `rm -f ${lockFile} || true`, "Releasing deployment lock");
      } catch (rollbackErr) {
        log("error", "Rollback failed - manual intervention may be required");
        try {
          runSSH(server, `rm -f ${lockFile} || true`, "Releasing deployment lock");
        } catch {}
      }

      process.exit(1);
    }
  };

  if (options.parallel) {
    await Promise.all(config.servers.map(deployToServer));
  } else {
    for (const server of config.servers) {
      await deployToServer(server);
    }
  }

  log("success", `Deploy ID: ${releaseId}`);

  const totalSeconds = (Date.now() - startTime) / 1000;
  let duration;

  if (totalSeconds >= 3600) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    duration = `${hours}h ${minutes}m ${seconds}s`;
  } else if (totalSeconds >= 60) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    duration = `${minutes}m ${seconds}s`;
  } else {
    duration = `${totalSeconds.toFixed(3)}s`;
  }

  log("success", `Deployment completed in ${duration}.`);
}

// ------------------------------
// LIST RELEASES
// ------------------------------

function listReleases() {
  const config = loadConfig();

  config.servers.forEach((server) => {
    try {
      if (options.dryRun) {
        log("info", "Listing releases...");
        log("success", `Releases on ${server.host}:`);
        console.log("Example-1\nExample-2\nExample-3");
        return;
      }

      const releases = runSSH(
        server,
        `ls -1 ${server.deployTo}/releases 2>/dev/null || echo "No releases found"`,
        "Listing releases",
      );

      if (releases === "No releases found") {
        log("info", `No releases found on ${server.host}`);
      } else {
        log("success", `Releases on ${server.host}:`);
        console.log(releases);
      }
    } catch (err) {
      log("error", `Failed to list releases on ${server.host}`);
    }
  });
}

// ------------------------------
// ROLLBACK
// ------------------------------

function rollback(version) {
  if (!version) {
    log("error", "Rollback requires release id.");
    process.exit(1);
  }

  const config = loadConfig();
  let hasErrors = false;

  config.servers.forEach((server) => {
    const base = server.deployTo;
    const releaseBase = `${base}/releases`;

    try {
      runSSH(
        server,
        `
        ln -sfn ${releaseBase}/${version} ${releaseBase}/current
      `,
        `Rolling back to ${version}`,
      );

      // Update webroot symlink if defined
      if (server.webroot) {
        runSSH(server, `rm -rf "${server.webroot}" 2>/dev/null || true && ln -sfn ${releaseBase}/current "${server.webroot}"`, "Updating webroot symlink");
      }

      runSSH(
        server,
        `
        cd ${releaseBase}/current &&
        ${server.startScript ?? "echo 'No restart script"}
      `,
        "Running start script for rolled back release",
      );

      log("success", `Rollback completed on ${server.host}`);
    } catch (err) {
      log("error", `Release ${version} may not exist on ${server.host}`);
      hasErrors = true;
    }
  });

  if (hasErrors) {
    process.exit(1);
  } else {
    log("success", `Rolled back to ${version}`);
  }
}

// ------------------------------
// INIT
// ------------------------------

function init() {
  const configPath = path.join(process.cwd(), "bare.config.json");

  if (fs.existsSync(configPath)) {
    log("error", "bare.config.json already exists in current directory");
    process.exit(1);
  }

  const defaultConfig = {
    servers: [
      {
        host: "your-server.com",
        user: "deploy",
        port: 22,
        identityFile: "~/.ssh/id_rsa",
        distDir: "./dist",
        deployTo: "/var/www/app",
        webroot: "",
        preScripts: [],
        postScripts: [],
        startScript: "pm2 restart --env production --update-env",
      },
    ],
    keepReleases: 5,
    healthCheck: {
      url: "http://localhost:3000/health",
      timeout: 15,
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  log("success", "Configuration file created. Edit 'bare.config.json' with your deployment settings.");
}

// ------------------------------
// CLEANUP
// ------------------------------

function cleanup() {
  const config = loadConfig();
  let hasErrors = false;

  config.servers.forEach((server) => {
    try {
      // First, list releases to be removed
      const releasesToRemove = runSSH(
        server,
        `
        cd ${server.deployTo}/releases &&
        ls -1t | tail -n +${config.keepReleases + 1}
      `,
        "Finding old releases",
      );

      if (releasesToRemove && releasesToRemove.trim()) {
        const releases = releasesToRemove.trim().split("\n");
        log("info", `Removing ${releases.length} old release${releases.length > 1 ? "s" : ""} on ${server.host}:`);
        releases.forEach((release) => {
          log("info", `  - ${release}`);
        });

        // Now remove them
        runSSH(
          server,
          `
          cd ${server.deployTo}/releases &&
          ls -1t | tail -n +${config.keepReleases + 1} | xargs -r rm -rf
        `,
          "Cleaning up old releases",
        );
        log("success", `Cleanup completed on ${server.host}`);
      } else {
        log("info", `No old releases to clean up on ${server.host}`);
      }
    } catch (err) {
      hasErrors = true;
    }
  });

  if (!hasErrors) {
    log("success", "Cleanup complete.");
  }
}

// ------------------------------
// COMMAND ROUTER
// ------------------------------

(async () => {
  if (options.queryVersion) {
    console.log(`Bare Deploy v${pkg.version}`);
    return;
  }

  try {
    switch (command) {
      case "init":
        init();
        break;
      case "deploy":
        await deploy();
        break;
      case "list":
        listReleases();
        break;
      case "rollback":
        rollback(args[1]);
        break;
      case "cleanup":
        cleanup();
        break;
      case "help":
      default:
        console.log(`
 ██████   █████  ██████  ███████
 ██   ██ ██   ██ ██   ██ ██
 ██████  ███████ ██████  █████
 ██   ██ ██   ██ ██   ██ ██
 ██████  ██   ██ ██   ██ ███████
 Deploy tool by Abtz Labs (v${pkg.version})

Commands:
  init              Create bare.config.json config file
  deploy            Run deployment
  list              List releases
  rollback <id>     Rollback to release
  cleanup           Remove old releases

Options:
  --dry-run         Simulate execution
  --json            JSON logging
  --sequential      Deploy server-by-server
  --patch           Bump patch version (default)
  --minor           Bump minor version
  --major           Bump major version

For full documentation, visit: https://github.com/abtz-labs/bare
        `);
    }
  } catch (err) {
    log("error", err.message);
    process.exit(1);
  }
})();
