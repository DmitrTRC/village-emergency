import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Incident } from "@village/shared";
import type { IncidentMarker } from "../../src/map/IncidentMap";

const h = vi.hoisted(() => ({ listIncidents: vi.fn(), captured: null as null | IncidentMarker[] }));
vi.mock("../../src/api/endpoints", () => ({ listIncidents: h.listIncidents }));
vi.mock("../../src/components/ReportHero", () => ({ ReportHero: () => <div data-testid="report-hero" /> }));
vi.mock("../../src/map/IncidentMap", () => {
  const IncidentMap = ({ markers }: { markers?: IncidentMarker[] }) => {
    h.captured = markers ?? null;
    return <div data-testid="incident-map" />;
  };
  return { IncidentMap, default: IncidentMap };
});

import { MapScreen } from "../../src/screens/MapScreen";

const withGeo: Incident = {
  id: "11111111-1111-4111-8111-111111111111",
  authorId: "a", level: "emergency", status: "delivered", visibility: "public",
  closeReason: null, text: null,
  geo: { lat: 55.7, lng: 37.6, accuracyM: 5, capturedAt: "2026-06-13T10:00:00.000Z" },
  createdAtClient: "2026-06-13T10:00:00.000Z", deliveredAtServer: null, acceptedAt: null, closedAt: null,
};
const noGeo: Incident = { ...withGeo, id: "22222222-2222-4222-8222-222222222222", geo: null };

beforeEach(() => { window.history.pushState(null, "", "/map"); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("MapScreen", () => {
  test("маркеры только из инцидентов с гео", async () => {
    h.listIncidents.mockResolvedValue([withGeo, noGeo]);
    render(<MapScreen />);
    await waitFor(() => expect(h.captured).not.toBeNull());
    expect(h.captured).toHaveLength(1);
    expect(h.captured![0]).toMatchObject({ id: withGeo.id, lat: 55.7, lng: 37.6, level: "emergency" });
  });
});
