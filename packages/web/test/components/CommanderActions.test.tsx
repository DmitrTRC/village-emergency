import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Incident } from "@village/shared";

const h = vi.hoisted(() => ({ acceptIncident: vi.fn(), closeIncident: vi.fn() }));
vi.mock("../../src/api/endpoints", () => ({
  acceptIncident: h.acceptIncident,
  closeIncident: h.closeIncident,
}));

import { CommanderActions } from "../../src/components/CommanderActions";

const base: Incident = {
  id: "11111111-1111-4111-8111-111111111111",
  authorId: "00000000-0000-4000-8000-000000000000",
  level: "offence",
  status: "delivered",
  visibility: "private",
  closeReason: null,
  text: "разбили фонарь",
  geo: null,
  createdAtClient: "2026-06-13T10:00:00.000Z",
  deliveredAtServer: "2026-06-13T10:00:01.000Z",
  acceptedAt: null,
  closedAt: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CommanderActions", () => {
  test("resident: кнопок нет", () => {
    render(<CommanderActions incident={base} role="resident" onUpdated={vi.fn()} />);
    expect(screen.queryByTestId("commander-actions")).toBeNull();
  });

  test("closed: действий нет даже у командира", () => {
    render(
      <CommanderActions
        incident={{ ...base, status: "closed", closeReason: "resolved", closedAt: base.createdAtClient }}
        role="commander"
        onUpdated={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("commander-actions")).toBeNull();
  });

  test("commander + delivered: видны Принять, Закрыть, Отклонить", () => {
    render(<CommanderActions incident={base} role="commander" onUpdated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Принять" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отклонить" })).toBeInTheDocument();
  });

  test("accept: вызывает acceptIncident и onUpdated", async () => {
    const onUpdated = vi.fn();
    const accepted: Incident = { ...base, status: "accepted", visibility: "public", acceptedAt: base.createdAtClient };
    h.acceptIncident.mockResolvedValue(accepted);
    render(<CommanderActions incident={base} role="commander" onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole("button", { name: "Принять" }));

    await waitFor(() => expect(h.acceptIncident).toHaveBeenCalledWith(base.id));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(accepted));
  });

  test("close: требует выбора причины из {resolved,false,duplicate}", async () => {
    const onUpdated = vi.fn();
    const closed: Incident = { ...base, status: "closed", closeReason: "duplicate", closedAt: base.createdAtClient };
    h.closeIncident.mockResolvedValue(closed);
    render(<CommanderActions incident={base} role="commander" onUpdated={onUpdated} />);

    const closeBtn = screen.getByRole("button", { name: "Закрыть" });
    expect(closeBtn).toBeDisabled();

    const select = screen.getByRole("combobox");
    expect([...select.querySelectorAll("option")].map((o) => (o as HTMLOptionElement).value)).toEqual(
      expect.arrayContaining(["resolved", "false", "duplicate"]),
    );

    fireEvent.change(select, { target: { value: "duplicate" } });
    expect(closeBtn).toBeEnabled();
    fireEvent.click(closeBtn);

    await waitFor(() => expect(h.closeIncident).toHaveBeenCalledWith(base.id, "duplicate"));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(closed));
  });

  test("reject: Отклонить = close(false)", async () => {
    const onUpdated = vi.fn();
    const rejected: Incident = { ...base, status: "closed", closeReason: "false", visibility: "private", closedAt: base.createdAtClient };
    h.closeIncident.mockResolvedValue(rejected);
    render(<CommanderActions incident={base} role="commander" onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole("button", { name: "Отклонить" }));

    await waitFor(() => expect(h.closeIncident).toHaveBeenCalledWith(base.id, "false"));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(rejected));
  });
});
