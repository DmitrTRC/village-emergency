import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { Incident } from "@village/shared";
import type { OutboxItem } from "../../src/db/idb";

const h = vi.hoisted(() => ({
  listIncidents: vi.fn(),
  outboxList: vi.fn(),
  sseHandler: null as null | (() => void),
}));
vi.mock("../../src/api/endpoints", () => ({ listIncidents: h.listIncidents }));
vi.mock("../../src/db/outbox", () => ({ list: h.outboxList }));
vi.mock("../../src/sse/useEventStream", () => ({
  useEventStream: (cb: () => void) => {
    h.sseHandler = cb;
  },
}));
vi.mock("../../src/components/ReportHero", () => ({ ReportHero: () => <div data-testid="report-hero" /> }));

import { Feed } from "../../src/screens/Feed";

const incident: Incident = {
  id: "11111111-1111-4111-8111-111111111111",
  authorId: "00000000-0000-4000-8000-000000000000",
  level: "offence",
  status: "delivered",
  visibility: "public",
  closeReason: null,
  text: "разбили фонарь",
  geo: null,
  createdAtClient: "2026-06-13T10:00:00.000Z",
  deliveredAtServer: null,
  acceptedAt: null,
  closedAt: null,
};

const pending: OutboxItem = {
  id: "22222222-2222-4222-8222-222222222222",
  input: { id: "22222222-2222-4222-8222-222222222222", level: "emergency", text: "пожар у реки" },
  media: [],
  status: "pending",
  createdAtClient: "2026-06-13T11:00:00.000Z",
};

beforeEach(() => {
  window.history.pushState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Feed", () => {
  test("рендерит серверные и pending-карточки с бейджами", async () => {
    h.listIncidents.mockResolvedValue([incident]);
    h.outboxList.mockResolvedValue([pending]);

    render(<Feed />);

    expect(await screen.findByText("пожар у реки")).toBeInTheDocument();
    expect(screen.getByText("разбили фонарь")).toBeInTheDocument();

    const levels = screen.getAllByTestId("level-badge").map((e) => e.textContent);
    expect(levels).toEqual(["Тревога", "Правонарушение"]);

    const statuses = screen.getAllByTestId("status-badge").map((e) => e.textContent);
    expect(statuses[0]).toContain("ожидает сети");
    expect(statuses[1]).toBe("Доставлено");

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/i/11111111-1111-4111-8111-111111111111",
    );
  });

  test("SSE-событие → перезагрузка ленты", async () => {
    h.listIncidents.mockResolvedValue([]);
    h.outboxList.mockResolvedValue([]);
    render(<Feed />);
    await screen.findByText("Пока нет инцидентов.");
    expect(h.listIncidents).toHaveBeenCalledTimes(1);

    h.listIncidents.mockResolvedValue([incident]);
    await act(async () => {
      h.sseHandler?.();
    });

    await waitFor(() => expect(h.listIncidents).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("разбили фонарь")).toBeInTheDocument();
  });

  test("пустая лента", async () => {
    h.listIncidents.mockResolvedValue([]);
    h.outboxList.mockResolvedValue([]);
    render(<Feed />);
    expect(await screen.findByText("Пока нет инцидентов.")).toBeInTheDocument();
  });

  test("офлайн: сеть упала — показываем pending из outbox", async () => {
    h.listIncidents.mockRejectedValue(new Error("offline"));
    h.outboxList.mockResolvedValue([pending]);
    render(<Feed />);
    const card = await screen.findByText("пожар у реки");
    expect(within(card.closest("article")!).getByTestId("status-badge").textContent).toContain(
      "ожидает сети",
    );
  });

  test("filter оставляет только подходящие карточки", async () => {
    const mine = { ...incident, id: "33333333-3333-4333-8333-333333333333", text: "моё", authorId: "me" };
    const alien = { ...incident, id: "44444444-4444-4444-8444-444444444444", text: "чужое", authorId: "other" };
    h.listIncidents.mockResolvedValue([mine, alien]);
    h.outboxList.mockResolvedValue([]);

    render(<Feed filter={(it) => it.authorId === "me"} />);

    expect(await screen.findByText("моё")).toBeInTheDocument();
    expect(screen.queryByText("чужое")).not.toBeInTheDocument();
  });
});
