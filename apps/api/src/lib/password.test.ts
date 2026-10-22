import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("produces a scrypt hash that never contains the plaintext", async () => {
    const hash = await hashPassword("super-secret-pass");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("super-secret-pass");
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("super-secret-pass");
    await expect(verifyPassword("super-secret-pass", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("super-secret-pass");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("salts hashes so identical passwords differ", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toBe(second);
  });

  it("returns false for malformed hashes", async () => {
    await expect(verifyPassword("anything", "not-a-hash")).resolves.toBe(false);
  });
});
