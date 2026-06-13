import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { config } from "../config";

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  mode: "pick" | "display";
  value?: LatLng | null;
  onChange?: (coords: LatLng) => void;
  zoom?: number;
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

export function IncidentMap({ mode, value, onChange, zoom = 14 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const center = value ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(),
      center: [center.lng, center.lat],
      zoom,
    });
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
      markerRef.current = null;
      map.remove();
    };
    // mount-once: режим/колбэк фиксируются при создании карты
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value && markerRef.current) markerRef.current.setLngLat([value.lng, value.lat]);
  }, [value]);

  return (
    <div
      ref={container}
      data-testid="incident-map"
      role="application"
      aria-label="Карта"
      style={{ height: 240, width: "100%" }}
    />
  );
}

export default IncidentMap;
