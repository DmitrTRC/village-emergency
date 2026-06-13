import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => {
  const markerHandlers: Record<string, () => void> = {};
  const mapHandlers: Record<string, (e: unknown) => void> = {};
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    on: vi.fn((type: string, cb: () => void) => {
      markerHandlers[type] = cb;
    }),
    getLngLat: vi.fn(() => ({ lng: 37.61, lat: 55.75 })),
    remove: vi.fn(),
  };
  const map = {
    on: vi.fn((type: string, cb: (e: unknown) => void) => {
      mapHandlers[type] = cb;
    }),
    remove: vi.fn(),
  };
  const MapCtor = vi.fn((_opts: { center: [number, number]; zoom: number }) => map);
  const MarkerCtor = vi.fn((_opts: { draggable: boolean }) => marker);
  return { marker, map, MapCtor, MarkerCtor, markerHandlers, mapHandlers };
});

vi.mock("maplibre-gl", () => ({
  default: { Map: h.MapCtor, Marker: h.MarkerCtor },
  Map: h.MapCtor,
  Marker: h.MarkerCtor,
}));

import { IncidentMap } from "../../src/map/IncidentMap";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IncidentMap", () => {
  test("монтируется и создаёт карту по координатам value", () => {
    render(<IncidentMap mode="display" value={{ lat: 55.75, lng: 37.61 }} />);

    expect(screen.getByTestId("incident-map")).toBeInTheDocument();
    expect(h.MapCtor).toHaveBeenCalledTimes(1);
    expect(h.MapCtor.mock.calls[0]![0]).toMatchObject({ center: [37.61, 55.75] });
  });

  test("display: маркер не draggable", () => {
    render(<IncidentMap mode="display" value={{ lat: 1, lng: 2 }} />);
    expect(h.MarkerCtor.mock.calls[0]![0]).toMatchObject({ draggable: false });
  });

  test("pick: маркер draggable, dragend → onChange", () => {
    const onChange = vi.fn();
    render(<IncidentMap mode="pick" value={{ lat: 1, lng: 2 }} onChange={onChange} />);

    expect(h.MarkerCtor.mock.calls[0]![0]).toMatchObject({ draggable: true });
    h.markerHandlers.dragend!();
    expect(onChange).toHaveBeenCalledWith({ lat: 55.75, lng: 37.61 });
  });

  test("pick: клик по карте перемещает маркер и зовёт onChange", () => {
    const onChange = vi.fn();
    render(<IncidentMap mode="pick" onChange={onChange} />);

    h.mapHandlers.click!({ lngLat: { lng: 30, lat: 50 } });
    expect(h.marker.setLngLat).toHaveBeenCalledWith({ lng: 30, lat: 50 });
    expect(onChange).toHaveBeenCalledWith({ lat: 50, lng: 30 });
  });

  test("unmount удаляет карту", () => {
    const { unmount } = render(<IncidentMap mode="display" value={{ lat: 1, lng: 2 }} />);
    unmount();
    expect(h.map.remove).toHaveBeenCalledTimes(1);
  });

  test("display c markers: создаёт маркер на каждый инцидент", () => {
    render(
      <IncidentMap
        mode="display"
        markers={[
          { id: "a", lat: 1, lng: 2, level: "emergency" },
          { id: "b", lat: 3, lng: 4, level: "attention" },
        ]}
      />,
    );
    // 1 центральный (value не задан → DEFAULT_CENTER) + 2 маркера инцидентов
    expect(h.MarkerCtor).toHaveBeenCalledTimes(3);
  });
});
