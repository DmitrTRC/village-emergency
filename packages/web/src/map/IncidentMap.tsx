import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { IncidentLevel } from "@village/shared";
import { LEVEL_COLOR } from "../feed/labels";
import { config } from "../config";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface IncidentMarker {
  id: string;
  lat: number;
  lng: number;
  level: IncidentLevel;
}

interface Props {
  mode: "pick" | "display";
  value?: LatLng | null;
  onChange?: (coords: LatLng) => void;
  zoom?: number;
  markers?: IncidentMarker[];
  onMarkerClick?: (id: string) => void;
}

const DEFAULT_CENTER: LatLng = { lat: 55.0, lng: 37.0 };

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [config.mapTileUrl],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

function dot(color: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", "Инцидент на карте");
  el.style.cssText = `width:18px;height:18px;border-radius:999px;border:2px solid #0b1220;background:${color};cursor:pointer;padding:0;`;
  return el;
}

export function IncidentMap({ mode, value, onChange, zoom = 14, markers, onMarkerClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const overlay = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!container.current) return;
    const center = value ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(),
      center: [center.lng, center.lat],
      zoom,
    });
    mapRef.current = map;
    const marker = new maplibregl.Marker({ draggable: mode === "pick" })
      .setLngLat([center.lng, center.lat])
      .addTo(map);
    markerRef.current = marker;

    if (mode === "pick") {
      const emit = (lngLat: { lng: number; lat: number }) =>
        onChange?.({ lat: lngLat.lat, lng: lngLat.lng });
      marker.on("dragend", () => emit(marker.getLngLat()));
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        emit(e.lngLat);
      });
    }

    return () => {
      for (const m of overlay.current) m.remove();
      overlay.current = [];
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // mount-once: режим/колбэк фиксируются при создании карты
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value && markerRef.current) markerRef.current.setLngLat([value.lng, value.lat]);
  }, [value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markers) return;
    for (const m of overlay.current) m.remove();
    overlay.current = markers.map((mk) => {
      const el = dot(LEVEL_COLOR[mk.level]);
      el.addEventListener("click", () => onMarkerClick?.(mk.id));
      return new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(map);
    });
  }, [markers, onMarkerClick]);

  return (
    <div
      ref={container}
      data-testid="incident-map"
      role="application"
      aria-label="Карта"
      style={{ height: "100%", minHeight: 240, width: "100%" }}
    />
  );
}

export default IncidentMap;
