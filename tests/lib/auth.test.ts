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
