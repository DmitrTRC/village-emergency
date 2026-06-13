import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  enqueue: vi.fn(),
  drainOutbox: vi.fn(),
  captureGeo: vi.fn(),
}));
vi.mock("../../src/db/outbox", () => ({ enqueue: h.enqueue }));
vi.mock("../../src/db/sync", () => ({ drainOutbox: h.drainOutbox }));
vi.mock("../../src/geo/capture", () => ({ captureGeo: h.captureGeo }));

import { PanicButton } from "../../src/components/PanicButton";

beforeEach(() => {
  vi.useFakeTimers();
  h.enqueue.mockResolvedValue(undefined);
  h.captureGeo.mockResolvedValue({
    lat: 55.7, lng: 37.6, accuracyM: 10, capturedAt: "2026-06-13T10:00:00.000Z",
  });
  (navigator as unknown as { vibrate: unknown }).vibrate = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("PanicButton", () => {
  test("удержание до порога → отпустил → emergency с гео", async () => {
    render(<PanicButton />);
    const btn = screen.getByTestId("panic-button");

    fireEvent.pointerDown(btn);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(btn).toHaveTextContent("Отпустите для отправки");

    await act(async () => { fireEvent.pointerUp(btn); });
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    const [input, media] = h.enqueue.mock.calls[0]!;
    expect(input.level).toBe("emergency");
    expect(input.geo).toMatchObject({ lat: 55.7, lng: 37.6 });
    expect(media).toEqual([]);
    expect(h.drainOutbox).toHaveBeenCalled();
  });

  test("ранний отпуск до порога → ничего не отправляется", () => {
    render(<PanicButton />);
    const btn = screen.getByTestId("panic-button");
    fireEvent.pointerDown(btn);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.pointerUp(btn);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  test("вибро на старте и на пороге", () => {
    render(<PanicButton />);
    fireEvent.pointerDown(screen.getByTestId("panic-button"));
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(navigator.vibrate).toHaveBeenCalledWith([0, 40]);
  });
});
