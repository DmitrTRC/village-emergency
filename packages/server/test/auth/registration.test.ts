import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeHouse, makeUser } from "../helpers/factories.js";
import { createRegistrationService } from "../../src/auth/registration.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("registration", () => {
  it("новый telegram_user_id создаёт pending-заявку", async () => {
    const house = await makeHouse(pg.db, "Лесная 1");
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "999" });
    const res = await svc.submit({
      telegramUserId: "111", name: "Пётр", claimedHouseAddress: "Лесная 1", phone: "+700",
    });
    expect(res.kind).toBe("pending");
  });

  it("approve создаёт user, привязанного к дому", async () => {
    const house = await makeHouse(pg.db, "Лесная 2");
    const commander = await makeUser(pg.db, { role: "commander" });
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "999" });
    const sub = await svc.submit({
      telegramUserId: "222", name: "Анна", claimedHouseAddress: "Лесная 2", phone: null,
    });
    const user = await svc.approve(sub.requestId!, commander.id);
    expect(user.role).toBe("resident");
    expect(user.telegramUserId).toBe("222");
  });

  it("bootstrap-командир при submit сразу получает роль commander и user без модерации", async () => {
    await makeHouse(pg.db, "Лесная 3");
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "777" });
    const res = await svc.submit({
      telegramUserId: "777", name: "Командир", claimedHouseAddress: "Лесная 3", phone: null,
    });
    expect(res.kind).toBe("approved");
    expect(res.user?.role).toBe("commander");
  });

  it("уже существующий пользователь при submit получает kind=existing", async () => {
    const house = await makeHouse(pg.db, "Лесная 4");
    const u = await makeUser(pg.db, { tg: "444", houseId: house.id });
    const svc = createRegistrationService(pg.db, { bootstrapCommanderTg: "999" });
    const res = await svc.submit({
      telegramUserId: "444", name: "x", claimedHouseAddress: "Лесная 4", phone: null,
    });
    expect(res.kind).toBe("existing");
  });
});
