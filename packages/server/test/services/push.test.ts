import { describe, it, expect, vi } from "vitest";
import { computePushTargets } from "../../src/services/push.js";

const sub = { endpoint: "https://x", keys: { p256dh: "a", auth: "b" } };

describe("computePushTargets", () => {
  it("emergency идёт всем с подпиской, плюс командиру", () => {
    const users = [
      { id: "c", role: "commander" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
      { id: "r1", role: "resident" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
      { id: "r2", role: "resident" as const, pushSubscription: null, notifyPrefs: { offence: false, attention: false } },
    ];
    const t = computePushTargets(users, "emergency");
    expect(t.map((u) => u.id).sort()).toEqual(["c", "r1"]);
  });

  it("offence идёт командиру всегда и жителям с notifyPrefs.offence=true", () => {
    const users = [
      { id: "c", role: "commander" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
      { id: "r1", role: "resident" as const, pushSubscription: sub, notifyPrefs: { offence: true, attention: false } },
      { id: "r2", role: "resident" as const, pushSubscription: sub, notifyPrefs: { offence: false, attention: false } },
    ];
    const t = computePushTargets(users, "offence");
    expect(t.map((u) => u.id).sort()).toEqual(["c", "r1"]);
  });
});
