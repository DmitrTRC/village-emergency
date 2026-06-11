import { describe, it, expect } from "vitest";
import { IncidentLevel, NewIncidentInput } from "../src/incident.js";

describe("IncidentLevel", () => {
  it("принимает три уровня", () => {
    expect(IncidentLevel.parse("emergency")).toBe("emergency");
    expect(IncidentLevel.parse("offence")).toBe("offence");
    expect(IncidentLevel.parse("attention")).toBe("attention");
  });
  it("отвергает чужой уровень", () => {
    expect(() => IncidentLevel.parse("warning")).toThrow();
  });
});

describe("NewIncidentInput", () => {
  it("emergency без текста и медиа — допустим", () => {
    const r = NewIncidentInput.safeParse({
      id: "0192f000-0000-7000-8000-000000000000",
      level: "emergency",
    });
    expect(r.success).toBe(true);
  });
  it("attention без текста, без медиа и без гео — отказ", () => {
    const r = NewIncidentInput.safeParse({
      id: "0192f000-0000-7000-8000-000000000000",
      level: "attention",
    });
    expect(r.success).toBe(false);
  });
});
