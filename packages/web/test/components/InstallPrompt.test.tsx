import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ subscribePush: vi.fn() }));
vi.mock("../../src/push/subscribe", () => ({ subscribePush: h.subscribePush }));

import { InstallPrompt } from "../../src/components/InstallPrompt";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fireBeforeInstall() {
  const ev = new Event("beforeinstallprompt") as Event & { prompt: () => Promise<void> };
  ev.prompt = vi.fn().mockResolvedValue(undefined);
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

describe("InstallPrompt", () => {
  test("кнопка установки появляется только после beforeinstallprompt", () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole("button", { name: "Добавить на экран" })).toBeNull();

    const ev = fireBeforeInstall();
    expect(screen.getByRole("button", { name: "Добавить на экран" })).toBeInTheDocument();
    expect(ev.prompt).not.toHaveBeenCalled();
  });

  test("клик по установке вызывает prompt и прячет кнопку", async () => {
    render(<InstallPrompt />);
    const ev = fireBeforeInstall();

    fireEvent.click(screen.getByRole("button", { name: "Добавить на экран" }));
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Добавить на экран" })).toBeNull(),
    );
  });

  test("включение уведомлений: granted → статус включено", async () => {
    h.subscribePush.mockResolvedValue(true);
    render(<InstallPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Включить уведомления" }));
    expect(h.subscribePush).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Уведомления включены")).toBeInTheDocument();
  });

  test("включение уведомлений: отказ → кнопка остаётся", async () => {
    h.subscribePush.mockResolvedValue(false);
    render(<InstallPrompt />);

    fireEvent.click(screen.getByRole("button", { name: "Включить уведомления" }));
    await waitFor(() => expect(h.subscribePush).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Включить уведомления" })).toBeInTheDocument();
  });
});
