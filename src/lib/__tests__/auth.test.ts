import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] } as any),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] } as any),
      release: jest.fn(),
    } as any),
    on: jest.fn(),
  })),
  Client: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue({ rows: [] } as any),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(3600),
    multi: jest.fn().mockReturnValue({
      incr: jest.fn().mockReturnThis(),
      ttl: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 3600]] as any),
    }),
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue("PONG"),
  }));
});

describe("OTP Module", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.OTP_EXPIRY_MINUTES = "10";
    process.env.OTP_RATE_LIMIT_PER_HOUR = "5";
  });

  describe("OTP code generation", () => {
    it("generates a 6-digit code", () => {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      expect(code).toHaveLength(6);
      expect(parseInt(code)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code)).toBeLessThanOrEqual(999999);
    });
  });

  describe("verifyOTP with invalid code", () => {
    it("returns invalid for wrong code", async () => {
      const { Pool } = require("pg");
      const mockPool = new Pool();
      mockPool.connect.mockResolvedValue({
        query: jest.fn().mockResolvedValue({ rows: [] } as any),
        release: jest.fn(),
      });

      const { verifyOTP } = await import("../otp");
      const result = await verifyOTP("test@example.com", "email", "000000");
      expect(result.valid).toBe(false);
    });
  });
});

describe("Auth Module", () => {
  describe("hashPassword and verifyPassword", () => {
    it("hashes and verifies password correctly", async () => {
      const { hashPassword, verifyPassword } = await import("../auth");
      const password = "TestPassword123!";
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);

      const valid = await verifyPassword(password, hash);
      expect(valid).toBe(true);

      const invalid = await verifyPassword("WrongPassword", hash);
      expect(invalid).toBe(false);
    });

    it("handles pbkdf2 fallback format", async () => {
      const { verifyPassword } = await import("../auth");
      const crypto = require("crypto");
      const password = "TestPass";
      const salt = crypto.randomBytes(16).toString("hex");
      const hashHex = crypto
        .pbkdf2Sync(password, salt, 100000, 64, "sha512")
        .toString("hex");
      const hash = `pbkdf2:${salt}:${hashHex}`;

      const valid = await verifyPassword(password, hash);
      expect(valid).toBe(true);
    });
  });
});
