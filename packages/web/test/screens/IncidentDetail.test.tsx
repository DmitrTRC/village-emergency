import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Incident, IncidentThread } from "@village/shared";
import { ApiError } from "../../src/api/client";

const h = vi.hoisted(() => ({ getIncidentById: vi.fn(), getIncidentThread: vi.fn() }));
vi.mock("../../src/api/endpoints", () => ({
  getIncidentById: h.getIncidentById,
  getIncidentThread: h.getIncidentThread,
}));

import { IncidentDetail } from "../../src/screens/IncidentDetail";

const incident: Incident = {
  id: "11111111-1111-4111-8111-111111111111",
  authorId: "00000000-0000-4000-8000-000000000000",
  level: "offence",
  status: "accepted",
  visibility: "private",
  closeReason: null,
  text: "разбили фонарь",
  geo: null,
  createdAtClient: "2026-06-13T10:00:00.000Z",
  deliveredAtServer: null,
  acceptedAt: null,
  closedAt: null,
};

const thread: IncidentThread = {
  events: [
    { id: "e1", type: "created", actorId: null, payload: null, at: "2026-06-13T10:00:00.000Z" },
    { id: "e2", type: "delivered", actorId: null, payload: null, at: "2026-06-13T10:00:01.000Z" },
    { id: "e3", type: "accepted", actorId: null, payload: null, at: "2026-06-13T10:05:00.000Z" },
  ],
  comments: [],
  media: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "photo",
      mime: "image/webp",
      url: "https://s3.example/photo.webp?sig=abc",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IncidentDetail", () => {
  test("рендерит инцидент, таймлайн и галерею", async () => {
    h.getIncidentById.mockResolvedValue(incident);
    h.getIncidentThread.mockResolvedValue(thread);

    render(<IncidentDetail id={incident.id} />);

    expect(await screen.findByText("разбили фонарь")).toBeInTheDocument();
    expect(screen.getByTestId("level-badge").textContent).toBe("Правонарушение");
    expect(screen.getByTestId("status-badge").textContent).toBe("Принято");

    const timeline = screen.getByTestId("timeline");
    expect(within(timeline).getAllByRole("listitem")).toHaveLength(3);
    expect(within(timeline).getByText("Принят")).toBeInTheDocument();

    const img = within(screen.getByTestId("media-gallery")).getByRole("img");
    expect(img).toHaveAttribute("src", "https://s3.example/photo.webp?sig=abc");
  });

  test("403 → экран «нет доступа»", async () => {
    h.getIncidentById.mockRejectedValue(new ApiError(403, "forbidden"));
    h.getIncidentThread.mockRejectedValue(new ApiError(403, "forbidden"));

    render(<IncidentDetail id={incident.id} />);

    expect(await screen.findByRole("heading", { name: "Нет доступа" })).toBeInTheDocument();
  });
});
