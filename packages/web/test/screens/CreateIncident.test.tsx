import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  enqueue: vi.fn(),
  drainOutbox: vi.fn(),
  captureGeo: vi.fn(),
  compress: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("../../src/db/outbox", () => ({ enqueue: h.enqueue }));
vi.mock("../../src/db/sync", () => ({ drainOutbox: h.drainOutbox }));
vi.mock("../../src/geo/capture", () => ({ captureGeo: h.captureGeo }));
vi.mock("../../src/media/compress", () => ({ compress: h.compress }));
vi.mock("../../src/router/router", () => ({
  navigate: h.navigate,
  Link: ({ to, children, ...rest }: { to: string; children: import("react").ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

import { CreateIncident } from "../../src/screens/CreateIncident";

beforeEach(() => {
  h.enqueue.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreateIncident", () => {
  test("пустая форма (не-emergency) → ошибка, enqueue не вызван", async () => {
    render(<CreateIncident />);
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  test("текст → enqueue с инцидентом + переход к ленте", async () => {
    render(<CreateIncident />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "пожар у соседей" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => expect(h.enqueue).toHaveBeenCalledTimes(1));
    const [input, media] = h.enqueue.mock.calls[0]!;
    expect(input.text).toBe("пожар у соседей");
    expect(input.level).toBe("attention");
    expect(input.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(media).toEqual([]);
    expect(h.navigate).toHaveBeenCalledWith("/");
  });

  test("emergency без текста и медиа — валиден", async () => {
    render(<CreateIncident />);
    fireEvent.click(screen.getByLabelText("Тревога"));
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => expect(h.enqueue).toHaveBeenCalledTimes(1));
    expect(h.enqueue.mock.calls[0]![0].level).toBe("emergency");
  });

  test("кнопка геолокации сохраняет координаты в инцидент", async () => {
    h.captureGeo.mockResolvedValue({
      lat: 55.7,
      lng: 37.6,
      accuracyM: 12,
      capturedAt: "2026-06-13T10:00:00.000Z",
    });
    render(<CreateIncident />);

    fireEvent.click(screen.getByRole("button", { name: /геолокаци/i }));
    expect(await screen.findByTestId("geo-indicator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(h.enqueue).toHaveBeenCalledTimes(1));
    expect(h.enqueue.mock.calls[0]![0].geo).toMatchObject({ lat: 55.7, lng: 37.6 });
  });

  test("фото сжимается и попадает в манифест и медиа outbox", async () => {
    h.compress.mockResolvedValue(new Blob(["x".repeat(100)], { type: "image/webp" }));
    render(<CreateIncident />);

    const file = new File(["raw"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("photo-input"), { target: { files: [file] } });

    await waitFor(() => expect(h.compress).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("photo-preview")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(h.enqueue).toHaveBeenCalledTimes(1));

    const [input, media] = h.enqueue.mock.calls[0]!;
    expect(input.media).toHaveLength(1);
    expect(input.media[0]).toMatchObject({ kind: "photo", mime: "image/webp", bytes: 100 });
    expect(media).toHaveLength(1);
    expect(media[0].mime).toBe("image/webp");
    expect(media[0].id).toBe(input.media[0].id);
  });

  test("не более 5 фото", async () => {
    h.compress.mockResolvedValue(new Blob(["x"], { type: "image/webp" }));
    render(<CreateIncident />);

    const files = Array.from(
      { length: 7 },
      (_, i) => new File(["raw"], `p${i}.jpg`, { type: "image/jpeg" }),
    );
    fireEvent.change(screen.getByTestId("photo-input"), { target: { files } });

    await waitFor(() => expect(h.compress).toHaveBeenCalledTimes(5));
  });
});
