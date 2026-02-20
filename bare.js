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
  const file = path.join(process.cwd(), "bare.json");

  if (!fs.existsSync(file)) {
    log("error", "bare.json not found.");
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

  return now
    .toISOString()
    .replace(/[-:T.]/g, "")
    .slice(0, 14);
}

function bumpVersion(type = "patch") {
  const pkgPath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath));
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

// ------------------------------
// DEPLOY
// ------------------------------

async function deploy() {
  const config = loadConfig();
  const startTime = Date.now();

  log("info", "Running pre-scripts...");

  for (const script of config.preScripts || []) {
    runLocal(script);
  }

  const version = bumpVersion(options.versionBump);
  const releaseId = `${generateReleaseId()}-${version}`;
  const archive = `${releaseId}.zip`;

  const distDir = config.distDir || ".";
  const zipCommand = buildZipCommand(distDir, archive, config);
  runLocal(zipCommand, "Creating deployment package...");

  const deployToServer = async (server) => {
    const base = config.deployTo;
    const releaseDir = `${base}/releases/${releaseId}`;
    const lockFile = `${base}/.deploy.lock`;

    log("info", `Deploying to ${server.host}...`);

    try {
      // Lock protection
      runSSH(server, `if [ -f ${lockFile} ]; then echo "Deploy locked"; exit 1; fi`, "Checking deployment lock");
      runSSH(server, `touch ${lockFile}`, "Acquiring deployment lock");

      scpTo(server, archive, `${config.tmpDir}/${archive}`);

      runSSH(
        server,
        `
        mkdir -p ${base}/releases &&
        mkdir -p ${releaseDir} &&
        unzip -q ${config.tmpDir}/${archive} -d ${releaseDir}
        `,
        "Extracting deployment package",
      );

      for (const script of config.postScripts || []) {
        runSSH(server, `cd ${releaseDir} && ${script}`, "Running post-deployment script");
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

      runSSH(server, `ln -sfn ${releaseDir} ${base}/current`, "Activating new release");
      runSSH(server, `rm -f ${lockFile}`, "Releasing deployment lock");

      log("success", `Deploy successful!`);
    } catch (err) {
      log("error", `Deploy failed on ${server.host}`);

      try {
        runSSH(server, `rm -rf ${releaseDir} || true`, "Cleaning up failed deployment");
        runSSH(server, `rm -f ${lockFile} || true`, "Releasing deployment lock");
      } catch {}

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

  if (!options.dryRun) fs.unlinkSync(archive);

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
        `ls -1 ${config.deployTo}/releases 2>/dev/null || echo "No releases found"`,
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
    try {
      runSSH(
        server,
        `
        ln -sfn ${config.deployTo}/releases/${version} ${config.deployTo}/current &&
        cd ${config.deployTo}/current &&
        pm2 reload ecosystem.config.js --update-env
      `,
        `Rolling back to ${version}`,
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
  const configPath = path.join(process.cwd(), "bare.json");

  if (fs.existsSync(configPath)) {
    log("error", "bare.json already exists in current directory");
    process.exit(1);
  }

  const defaultConfig = {
    servers: [
      {
        host: "your-server.com",
        user: "deploy",
        port: 22,
        identityFile: "~/.ssh/id_rsa",
      },
    ],
    deployTo: "/var/www/app",
    tmpDir: "/tmp",
    distDir: "./dist",
    keepReleases: 5,
    include: [],
    ignore: [".git/*", "*.log"],
    preScripts: ["npm run build"],
    postScripts: ["pm2 start --env production --update-env"],
    healthCheck: {
      url: "http://localhost:3000/health",
      timeout: 15,
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  log("success", "Configuration file created. Edit 'bare.json' with your deployment settings.");
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
        cd ${config.deployTo}/releases &&
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
          cd ${config.deployTo}/releases &&
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
 Deploy tool by Abtz Labs

Commands:
  init              Create bare.json config file
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

Configuration (bare.json):
  distDir           Directory to package (default: ".")
  include           File patterns to include (e.g., ["*.js", "views/*"])
  ignore            File patterns to exclude (e.g., [".git/*", "*.log"])
                    Note: include and ignore can be used together

For full documentation, visit: https://github.com/abtz-labs/bare
        `);
    }
  } catch (err) {
    log("error", err.message);
    process.exit(1);
  }
})();
