import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { IncidentComment } from "@village/shared";

const h = vi.hoisted(() => ({ addComment: vi.fn() }));
vi.mock("../../src/api/endpoints", () => ({ addComment: h.addComment }));

import { Comments } from "../../src/components/Comments";

const ID = "11111111-1111-4111-8111-111111111111";
const existing: IncidentComment = {
  id: "22222222-2222-4222-8222-222222222222",
  authorId: "00000000-0000-4000-8000-000000000000",
  text: "уже было",
  createdAt: "2026-06-13T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Comments", () => {
  test("accepted: форма есть, отправка оптимистична", async () => {
    let resolve!: (v: { id: string; text: string }) => void;
    h.addComment.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Comments incidentId={ID} status="accepted" initial={[existing]} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "видел" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByText("видел")).toBeInTheDocument();
    expect(h.addComment).toHaveBeenCalledWith(ID, "видел");

    resolve({ id: "33333333-3333-4333-8333-333333333333", text: "видел" });
    await waitFor(() => expect(screen.getByText("видел")).toBeInTheDocument());
  });

  test("closed: формы нет, тред заморожен", () => {
    render(<Comments incidentId={ID} status="closed" initial={[existing]} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("frozen")).toBeInTheDocument();
    expect(screen.getByText("уже было")).toBeInTheDocument();
  });

  test("delivered: ни формы, ни заморозки", () => {
    render(<Comments incidentId={ID} status="delivered" initial={[]} />);

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByTestId("frozen")).toBeNull();
  });

  test("ошибка отправки → откат комментария, текст сохранён для повтора", async () => {
    h.addComment.mockRejectedValue(new Error("offline"));
    render(<Comments incidentId={ID} status="accepted" initial={[]} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "упадёт" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("textbox")).toHaveValue("упадёт");
  });
});
