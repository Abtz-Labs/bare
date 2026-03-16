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
import { fileURLToPath } from "url";
import { execSync } from "child_process";

// ------------------------------
// CONFIG
// ------------------------------

function getCliVersion() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const pkgPath = path.join(__dirname, "package.json");
    return JSON.parse(fs.readFileSync(pkgPath)).version;
  } catch {
    return "?.?.?";
  }
}

function loadPkg() {
  const pkgPath = path.join(process.cwd(), "package.json");

  if (!fs.existsSync(pkgPath)) {
    throw new Error("package.json not found. Run in a project directory with package.json.");
  }

  return JSON.parse(fs.readFileSync(pkgPath));
}

function loadConfig() {
  const file = path.join(process.cwd(), "bare.config.json");

  if (!fs.existsSync(file)) {
    log("error", "bare.config.json not found.");
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(file));

  for (const server of config.servers) {
    if (server.deployTo && !path.isAbsolute(server.deployTo)) {
      log("error", `deployTo must be an absolute path, got: ${server.deployTo}`);
      process.exit(1);
    }

    if (server.webroot && server.webroot.trim() && !path.isAbsolute(server.webroot)) {
      log("error", `webroot must be an absolute path, got: ${server.webroot}`);
      process.exit(1);
    }
  }

  return config;
}

// ------------------------------
// CLI ARGUMENTS
// ------------------------------

const args = process.argv.slice(2);
const command = args[0];

const options = {
  dryRun: args.includes("--dry-run"),
  json: args.includes("--json"),
  verbose: args.includes("--verbose") || args.includes("--debug"),
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

  let color;

  switch (level) {
    case "success":
      color = colors.green;
      break;
    case "error":
      color = colors.red;
      break;
    case "warn":
      color = colors.yellow;
      break;
    default:
      color = colors.reset;
      break;
  }

  console.log(`${color}${message}${colors.reset}`);
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
  const message = description || `  - ${cmd}`;

  log("info", message);
  if (options.verbose) {
    console.log(`    command: ${cmd}`);
  }

  if (options.dryRun) return;

  try {
    return execSync(cmd, { stdio: "pipe" }).toString().trim();
  } catch (err) {
    const errorMsg = `Local command failed: ${description || cmd}`;
    log("error", errorMsg);
    const cleanError = new Error(errorMsg);
    throw cleanError;
  }
}

function runSSH(server, cmd, description) {
  const base = buildSSHBase(server);
  const escapedCmd = cmd.replace(/'/g, "'\\''");
  const fullCmd = `${base} '${escapedCmd}'`;
  const message = description || `  - ${cmd}`;

  log("info", message);
  if (options.verbose) {
    console.log(`    target: ${server.user}@${server.host}`);
    console.log(`    action: ${description || "running command"}`);
    console.log(`    command: ${cmd}`);
  }

  if (options.dryRun) return;

  try {
    return execSync(fullCmd, { stdio: "pipe" }).toString().trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : "";
    const errorMsg = `SSH command failed: ${description || cmd}`;
    
    if (options.verbose && stderr) {
      console.log(`    stderr: ${stderr}`);
    }
    
    log("error", errorMsg);
    if (stderr && !options.verbose) {
      log("error", `  stderr: ${stderr}`);
    }

    const cleanError = new Error(errorMsg);
    cleanError.host = server.host;
    cleanError.description = description;
    cleanError.stderr = stderr;

    throw cleanError;
  }
}

function scpTo(server, localFile, remotePath) {
  const base = buildSCPBase(server);
  const fullCmd = `${base} ${localFile} ${server.user}@${server.host}:${remotePath}`;

  log("info", `Uploading package...`);
  if (options.verbose) {
    console.log(`    from: ${localFile}`);
    console.log(`    to: ${server.user}@${server.host}:${remotePath}`);
  }

  if (options.dryRun) return;

  try {
    execSync(fullCmd, { stdio: "pipe" });
    log("success", `Package uploaded successfully!`);
  } catch (err) {
    const errorMsg = `Upload failed to ${server.host}`;
    log("error", errorMsg);

    const cleanError = new Error(errorMsg);
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

function bumpVersion(pkg, type = "patch") {
  const parts = pkg.version.split(".").map((n) => parseInt(n));

  switch (type) {
    case "major":
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case "minor":
      parts[1] += 1;
      parts[2] = 0;
      break;
    default: // patch
      parts[2] += 1;
      break;
  }

  const newVersion = parts.join(".");

  log("success", `Version bumped to ${newVersion} (${type})`);

  return newVersion;
}

function buildZipCommand(distDir, archive, config) {
  const includePatterns = config.include || [];
  const ignorePatterns = config.ignore || [".git/*"];
  const archivePath = distDir === "./" ? `./${archive}` : `../${archive}`;
  let zipCmd = `cd ${distDir} && zip -r ${archivePath}`;

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
  const pkg = loadPkg();
  const startTime = Date.now();
  const originalVersion = pkg.version;
  const newVersion = bumpVersion(pkg, options.versionBump);

  if (!options.dryRun) {
    pkg.version = newVersion;
    const pkgPath = path.join(process.cwd(), "package.json");
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  const version = newVersion;
  const releaseId = `${generateReleaseId()}-${version}`;

  const deployToServer = async (server) => {
    log("info", `Server: ${server.host}`);

    // Run preScripts locally for this server
    if (server.preScripts && server.preScripts.length > 0) {
      log("info", "Running pre-scripts...");

      for (const script of server.preScripts) {
        runLocal(script);
      }
    }

    // Create zip for this server's distDir
    const archive = `${releaseId}.${server.host}.zip`;
    const distDir = server.distDir || "./dist";
    const serverConfig = {
      include: server.include ?? config.include ?? [],
      ignore: server.ignore ?? config.ignore ?? [".git/*"],
    };
    const zipCommand = buildZipCommand(distDir, archive, serverConfig);

    runLocal(zipCommand, "Creating package...");

    const base = server.deployTo;
    const releaseBase = `${base}/releases`;
    const releaseDir = `${releaseBase}/${releaseId}`;
    const lockFile = `${base}/.bare-deploy.lock`;
    let previousReleaseForRollback;

    log("info", "Deploying...");

    try {
      // Lock protection
      runSSH(server, `if [ -f ${lockFile} ]; then echo "Deploy locked"; exit 1; fi`, "Checking lock");
      runSSH(server, `touch ${lockFile}`, "Acquiring lock");

      // Create base deploy directory and release directory
      runSSH(server, `mkdir -p ${releaseDir}`, "Creating release directory");

      if (server.webroot) {
        // Handle webroot migration (first deploy: if webroot is a directory, backup it)
        const isDir = runSSH(
          server,
          `[ -d "${server.webroot}" ] && echo "dir" || echo "not-dir"`,
          "Checking webroot type",
        );

        if (isDir === "dir") {
          try {
            runSSH(server, `mv "${server.webroot}" "${server.webroot}.bak"`, "Backing up original webroot");
          } catch (err) {
            const cleanError = new Error(
              `Failed to backup webroot directory. The deploy user needs write permissions on the webroot directory. ` +
                `Add the deploy user to the www-data group: sudo usermod -a -G www-data ${server.user}`,
            );
            cleanError.host = server.host;
            cleanError.description = "Backing up original webroot";
            throw cleanError;
          }
        }
      }

      scpTo(server, archive, `${releaseDir}/${archive}`);

      runSSH(
        server,
        `
        unzip -q ${releaseDir}/${archive} -d ${releaseDir} &&
        rm -f ${releaseDir}/${archive}
      `,
        "Extracting package",
      );

      if (server.webroot) {
        // Copy .well-known for Let's Encrypt before switching
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
      }

      // Capture previous release for potential rollback - BEFORE creating new symlink
      previousReleaseForRollback = runSSH(
        server,
        `readlink ${releaseBase}/current 2>/dev/null || echo ""`,
        "Capturing previous release",
      );

      // Update symlink BEFORE running postScripts so they operate on the new release
      runSSH(server, `ln -sfn ${releaseDir} ${releaseBase}/current`, "Activating new release");

      // Create previous symlink if there was a previous release
      if (previousReleaseForRollback && previousReleaseForRollback.trim() !== "") {
        runSSH(server, `ln -sfn ${previousReleaseForRollback} ${releaseBase}/previous`, "Creating previous symlink");
      }

      // Create webroot symlink if configured
      if (server.webroot) {
        const webrootCmd = `rm -rf "${server.webroot}" && ln -sfn ${releaseBase}/current "${server.webroot}"`;
        try {
          runSSH(server, webrootCmd, "Creating webroot symlink");
        } catch (err) {
          const cleanError = new Error(
            `Failed to create webroot symlink. The deploy user needs write permissions on the webroot directory. ` +
              `Add the deploy user to the www-data group: sudo usermod -a -G www-data ${server.user}`,
          );
          cleanError.host = server.host;
          cleanError.description = "Creating webroot symlink";
          throw cleanError;
        }
      }

      if (server.postScripts && server.postScripts.length) {
        log("info", "Running post-scripts...");

        for (const script of server.postScripts) {
          runSSH(server, script);
        }
      }

      if (server.startScript) {
        log("info", "Running start script...");
        runSSH(server, `cd ${releaseBase}/current && ${server.startScript}`);
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

      runSSH(server, `rm -f ${lockFile}`, "Releasing lock");

      if (!options.dryRun) fs.unlinkSync(archive);

      log("success", `Deploy successful on ${server.host}!`);
    } catch (err) {
      log("error", `Deploy failed on ${server.host}: ${err.message}`);

      // Rollback version in package.json
      if (!options.dryRun) {
        const pkgPath = path.join(process.cwd(), "package.json");
        pkg.version = originalVersion;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        log("info", `Rolled back version to ${originalVersion}`);
      }

      // Delete local zip file
      if (!options.dryRun && fs.existsSync(archive)) {
        fs.unlinkSync(archive);
        log("info", `Deleted local archive ${archive}`);
      }

      try {
        // Attempt rollback if there was a previous release AND it exists
        if (previousReleaseForRollback && previousReleaseForRollback.trim() !== "") {
          // Verify previous release directory actually exists before rollback
          const prevExists = runSSH(
            server,
            `[ -d "${previousReleaseForRollback}" ] && echo "yes" || echo "no"`,
            "Verifying previous release exists",
          );

          if (prevExists !== "yes") {
            log("error", "First deployment failed - no valid previous release to revert to");

            // Remove the broken symlink
            runSSH(server, `rm -f ${releaseBase}/current`, "Removing broken symlink");
          } else {
            log("warn", "Attempting rollback to previous release...");

            // Revert symlink to previous release
            runSSH(
              server,
              `ln -sfn ${previousReleaseForRollback} ${releaseBase}/current`,
              "Reverting symlink to previous release",
            );

            // Get all releases to find the version before rollback target
            const allReleases = runSSH(
              server,
              `ls -1 ${releaseBase} | grep -v '^current$' | grep -v '^previous$' | sort`,
              "Listing all releases for previous update",
            );

            const releases = allReleases.split("\n").filter((r) => r.trim());
            const rollbackTarget = previousReleaseForRollback.split("/").pop();
            const rollbackIndex = releases.indexOf(rollbackTarget);

            // Update previous to version before rollback target if available
            if (rollbackIndex > 0) {
              const versionBeforeRollback = releases[rollbackIndex - 1];
              runSSH(
                server,
                `ln -sfn ${releaseBase}/${versionBeforeRollback} ${releaseBase}/previous`,
                "Updating previous to version before rollback target",
              );
            }

            // Re-run startScript for rollback
            if (server.startScript) {
              try {
                runSSH(
                  server,
                  `cd ${releaseBase}/current && ${server.startScript}`,
                  "Running start script for previous release",
                );
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
          }
        }

        // Clean up failed release directory
        runSSH(server, `rm -rf ${releaseDir} || true`, "Cleaning up failed deployment");
        runSSH(server, `rm -f ${lockFile} || true`, "Releasing lock");
      } catch (rollbackErr) {
        log("error", "Rollback failed - manual intervention may be required");

        try {
          runSSH(server, `rm -f ${lockFile} || true`, "Releasing lock");
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

  log("success", `Completed in ${duration}.`);
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
        console.log("20260220123456-v1.0.1\n20260220150000-v1.0.2\n20260220162341-v1.0.3");

        return;
      }

      const releases = runSSH(
        server,
        `ls -1 ${server.deployTo}/releases 2>/dev/null | grep -v '^current$' || echo "No releases found"`,
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

async function rollback(version) {
  if (!version) {
    log("error", "Rollback requires release id.");
    process.exit(1);
  }

  const config = loadConfig();

  const rollbackServer = async (server) => {
    const base = server.deployTo;
    const releaseBase = `${base}/releases`;

    if (options.dryRun) {
      log("info", `Rolling back to ${version}...`);

      if (server.webroot) {
        log("info", "Updating webroot symlink...");
      }

      log("info", "Running start script for rolled back release...");
      log("success", `Rollback completed on ${server.host}`);

      return;
    }

    try {
      // Get current and previous symlinks before rollback
      const currentBeforeRollback = runSSH(
        server,
        `readlink ${releaseBase}/current 2>/dev/null || echo ""`,
        "Getting current symlink target",
      );

      // Get the version before the rollback target
      const allReleases = runSSH(
        server,
        `ls -1 ${releaseBase} | grep -v '^current$' | grep -v '^previous$' | sort`,
        "Listing all releases",
      );

      const releases = allReleases.split("\n").filter((r) => r.trim());
      const rollbackIndex = releases.indexOf(version);

      runSSH(
        server,
        `
        ln -sfn ${releaseBase}/${version} ${releaseBase}/current
      `,
        `Rolling back to ${version}`,
      );

      // Update previous symlink: previous becomes current, then update to 1 version before rollback target
      if (currentBeforeRollback && currentBeforeRollback.trim() !== "") {
        // First set previous to what current was (for the "previous becomes current" behavior)
        runSSH(
          server,
          `ln -sfn ${currentBeforeRollback} ${releaseBase}/previous`,
          "Updating previous symlink to previous current",
        );
      }

      // Then update previous to 1 version before the rollback target if available
      if (rollbackIndex > 0) {
        const versionBeforeRollback = releases[rollbackIndex - 1];
        runSSH(
          server,
          `ln -sfn ${releaseBase}/${versionBeforeRollback} ${releaseBase}/previous`,
          "Updating previous to version before rollback target",
        );
      }

      if (server.webroot) {
        const webrootCmd = `rm -rf "${server.webroot}" && ln -sfn ${releaseBase}/current "${server.webroot}"`;
        try {
          runSSH(server, webrootCmd, "Updating webroot symlink");
        } catch (err) {
          const cleanError = new Error(
            `Failed to update webroot symlink. The deploy user needs write permissions on the webroot directory. ` +
              `Add the deploy user to the www-data group: 'sudo usermod -a -G www-data ${server.user}'`,
          );
          cleanError.host = server.host;
          cleanError.description = "Updating webroot symlink";
          throw cleanError;
        }
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
      log("error", `Rollback failed on ${server.host}: ${err.message}`);
      throw err;
    }
  };

  if (options.parallel) {
    await Promise.all(config.servers.map(rollbackServer));
  } else {
    for (const server of config.servers) {
      await rollbackServer(server);
    }
  }

  log("success", `Rolled back to ${version}`);
}

// ------------------------------
// INIT
// ------------------------------

function init() {
  const configPath = path.join(process.cwd(), "bare.config.json");
  const pkgPath = path.join(process.cwd(), "package.json");
  const gitignorePath = path.join(process.cwd(), ".gitignore");

  if (!fs.existsSync(pkgPath)) {
    log("warn", "No package.json found in current directory.");
    log("info", "");
    log("info", "Bare uses package.json to manage deployment versions.");
    log("info", "Each deploy will bump the version automatically.");
    log("info", "Creating package.json with version 0.1.0...");
    log("info", "");

    const defaultPkg = { version: "0.1.0" };
    fs.writeFileSync(pkgPath, JSON.stringify(defaultPkg, null, 2));
    log("success", 'package.json created with { "version": "0.1.0" }');
  }

  if (fs.existsSync(configPath)) {
    log("error", "bare.config.json already exists in current directory");
    process.exit(1);
  }

  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf-8") : "";

  const hasConfigEntry = /^bare\.config\.json$/m.test(gitignoreContent);

  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "bare.config.json\n");
    log("success", ".gitignore created with bare.config.json entry");
  } else if (!hasConfigEntry) {
    fs.writeFileSync(gitignorePath, gitignoreContent.trim() + "\nbare.config.json\n");
    log("success", "Added bare.config.json to .gitignore");
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
        include: [],
        ignore: [],
        preScripts: [],
        postScripts: [],
        startScript: "pm2 restart --env production --update-env",
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

  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  log("success", "Configuration file created. Edit 'bare.config.json' with your deployment settings.");
}

// ------------------------------
// CLEANUP
// ------------------------------

async function cleanup() {
  const config = loadConfig();

  const cleanupServer = async (server) => {
    if (options.dryRun) {
      const releasesToRemove = runSSH(
        server,
        `
        cd ${server.deployTo}/releases &&
        ls -1 | grep -v '^current$' | sort -r | tail -n +${config.keepReleases + 1}
      `,
        "Finding old releases",
      );

      if (releasesToRemove && releasesToRemove.trim()) {
        const releases = releasesToRemove.trim().split("\n");
        log("info", `Removing ${releases.length} old release${releases.length > 1 ? "s" : ""} on ${server.host}:`);
        releases.forEach((release) => {
          log("info", `  - ${release}`);
        });
        log("info", "Cleaning up old releases...");
      } else {
        log("info", `No old releases to clean up on ${server.host}`);
      }
      log("success", `Cleanup completed on ${server.host}`);
      return;
    }

    try {
      const releasesToRemove = runSSH(
        server,
        `
        cd ${server.deployTo}/releases &&
        ls -1 | grep -v '^current$' | sort -r | tail -n +${config.keepReleases + 1}
      `,
        "Finding old releases",
      );

      if (releasesToRemove && releasesToRemove.trim()) {
        const releases = releasesToRemove.trim().split("\n");

        log("info", `Removing ${releases.length} old release${releases.length > 1 ? "s" : ""} on ${server.host}:`);
        releases.forEach((release) => {
          log("info", `  - ${release}`);
        });

        runSSH(
          server,
          `
          cd ${server.deployTo}/releases &&
          ls -1 | grep -v '^current$' | sort -r | tail -n +${config.keepReleases + 1} | xargs -r rm -rf
        `,
          "Cleaning up old releases",
        );

        log("success", `Cleanup completed on ${server.host}`);
      } else {
        log("info", `No old releases to clean up on ${server.host}`);
      }
    } catch (err) {
      throw err;
    }
  };

  if (options.parallel) {
    await Promise.all(config.servers.map(cleanupServer));
  } else {
    for (const server of config.servers) {
      await cleanupServer(server);
    }
  }

  log("success", "Cleanup complete.");
}

// ------------------------------
// VERSION CHECKER
// ------------------------------

function parseVersion(v) {
  return v
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10));
}

function isNewerVersion(current, latest) {
  const cur = parseVersion(current);
  const lat = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    if (lat[i] > cur[i]) return true;
    if (lat[i] < cur[i]) return false;
  }

  return false;
}

async function checkForUpdate() {
  try {
    const currentVersion = getCliVersion();
    const result = execSync("npm view bare-deploy version", {
      stdio: "pipe",
      encoding: "utf-8",
    });
    const latestVersion = result.trim();

    if (isNewerVersion(currentVersion, latestVersion)) {
      console.log("");
      log("warn", `A new version of bare-deploy is available: ${latestVersion} (you're on ${currentVersion})`);
      log("info", "Run: 'npm install -g bare-deploy' to update");
      console.log("");
    }
  } catch {
    // Silently fail if npm view fails (offline, registry issues, etc.)
  }
}

// ------------------------------
// COMMAND ROUTER
// ------------------------------

(async () => {
  if (options.queryVersion) {
    await checkForUpdate();
    console.log(`Bare Deploy v${getCliVersion()}`);
    return;
  }

  const commandsWithVersionCheck = ["deploy", "list", "rollback", "cleanup"];

  if (commandsWithVersionCheck.includes(command)) {
    await checkForUpdate();
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
        const cliVersion = getCliVersion();
        console.log(`
 ██████   █████  ██████  ███████
 ██   ██ ██   ██ ██   ██ ██
 ██████  ███████ ██████  █████
 ██   ██ ██   ██ ██   ██ ██
 ██████  ██   ██ ██   ██ ███████
  Deploy tool by Abtz Labs (v${cliVersion})

Commands:
  init              Create bare.config.json file
  deploy            Run deployment
  list              List releases
  rollback <id>     Rollback to release
  cleanup           Remove old releases

Options:
  --dry-run         Simulate execution
  --json            JSON logging
  --verbose         Show detailed operation info
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

// Exports for testing
export {
  generateReleaseId,
  bumpVersion,
  buildZipCommand,
  buildSSHBase,
  buildSCPBase,
  log,
  loadConfig,
  options,
  runSSH,
  runLocal,
  scpTo,
  deploy,
  listReleases,
  rollback,
  cleanup,
  init,
  isNewerVersion,
  checkForUpdate,
};
