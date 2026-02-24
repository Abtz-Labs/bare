import { describe, it, expect } from "vitest";
import { buildSSHBase, buildSCPBase } from "../../bare.js";

describe("SSH helpers", () => {
  describe("buildSSHBase", () => {
    it("builds SSH command with default port", () => {
      const server = { host: "server1.com", user: "deploy" };
      const result = buildSSHBase(server);

      expect(result).toContain("ssh");
      expect(result).toContain("-p 22");
      expect(result).toContain("deploy@server1.com");
      expect(result).toContain("BatchMode=yes");
      expect(result).toContain("StrictHostKeyChecking=accept-new");
    });

    it("builds SSH command with custom port", () => {
      const server = { host: "server1.com", user: "deploy", port: 2222 };
      const result = buildSSHBase(server);

      expect(result).toContain("-p 2222");
    });

    it("builds SSH command with identity file", () => {
      const server = {
        host: "server1.com",
        user: "deploy",
        identityFile: "~/.ssh/id_rsa",
      };
      const result = buildSSHBase(server);

      expect(result).toContain("-i ~/.ssh/id_rsa");
    });

    it("builds SSH command without identity file when not provided", () => {
      const server = { host: "server1.com", user: "deploy" };
      const result = buildSSHBase(server);

      expect(result).not.toContain("-i");
    });
  });

  describe("buildSCPBase", () => {
    it("builds SCP command with default port", () => {
      const server = { host: "server1.com", user: "deploy" };
      const result = buildSCPBase(server);

      expect(result).toContain("scp");
      expect(result).toContain("-P 22");
      expect(result).toContain("BatchMode=yes");
      expect(result).toContain("StrictHostKeyChecking=accept-new");
    });

    it("builds SCP command with custom port", () => {
      const server = { host: "server1.com", user: "deploy", port: 2222 };
      const result = buildSCPBase(server);

      expect(result).toContain("-P 2222");
    });

    it("builds SCP command with identity file", () => {
      const server = {
        host: "server1.com",
        user: "deploy",
        identityFile: "~/.ssh/id_ed25519",
      };
      const result = buildSCPBase(server);

      expect(result).toContain("-i ~/.ssh/id_ed25519");
    });

    it("builds SCP command without identity file when not provided", () => {
      const server = { host: "server1.com", user: "deploy" };
      const result = buildSCPBase(server);

      expect(result).not.toContain("-i");
    });
  });
});
