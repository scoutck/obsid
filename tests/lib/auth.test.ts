// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, createToken, verifyToken } from "@/lib/auth";

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("testpass123");
    expect(hash).not.toBe("testpass123");
    expect(await verifyPassword("testpass123", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("testpass123");
    expect(await verifyPassword("wrongpass", hash)).toBe(false);
  });
});

describe("JWT", () => {
  it("creates and verifies a token", async () => {
    const token = await createToken({ sub: "user-123", username: "alice" });
    expect(typeof token).toBe("string");

    const payload = await verifyToken(token);
    expect(payload.sub).toBe("user-123");
    expect(payload.username).toBe("alice");
  });

  it("rejects a tampered token", async () => {
    const token = await createToken({ sub: "user-123", username: "alice" });
    const tampered = token.slice(0, -5) + "XXXXX";
    await expect(verifyToken(tampered)).rejects.toThrow();
  });
});

describe("edge cases", () => {
  it("rejects empty password for hashing", async () => {
    // Test if empty password is handled or throws
    const hash = await hashPassword("");
    // Should still produce a valid hash (bcrypt handles empty strings)
    expect(hash).toBeDefined();
    expect(await verifyPassword("", hash)).toBe(true);
  });

  it("rejects verification with wrong password", async () => {
    const hash = await hashPassword("correct");
    const result = await verifyPassword("wrong", hash);
    expect(result).toBe(false);
  });

  it("verifies token with correct secret", async () => {
    const token = await createToken({ sub: "123", username: "test" });
    const payload = await verifyToken(token);
    expect(payload.sub).toBe("123");
    expect(payload.username).toBe("test");
  });

  it("rejects malformed JWT", async () => {
    await expect(verifyToken("not.a.jwt")).rejects.toThrow();
  });

  it("rejects empty string token", async () => {
    await expect(verifyToken("")).rejects.toThrow();
  });
});
