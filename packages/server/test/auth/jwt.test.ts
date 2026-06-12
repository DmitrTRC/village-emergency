import { describe, it, expect } from "vitest";
import { createJwt } from "../../src/auth/jwt.js";

const secret = "x".repeat(64);

describe("jwt", () => {
  it("подписывает и верифицирует access-токен", async () => {
    const j = createJwt(secret);
    const token = await j.signAccess({ sub: "u1", role: "resident" });
    const claims = await j.verifyAccess(token);
    expect(claims.sub).toBe("u1");
    expect(claims.role).toBe("resident");
  });

  it("отвергает подделанный токен", async () => {
    const j = createJwt(secret);
    await expect(j.verifyAccess("not.a.jwt")).rejects.toThrow();
  });

  it("refresh-токен содержит jti", async () => {
    const j = createJwt(secret);
    const { token, jti } = await j.signRefresh("u1");
    const claims = await j.verifyRefresh(token);
    expect(claims.jti).toBe(jti);
    expect(claims.sub).toBe("u1");
  });
});
