import { useEffect, useState } from "react";
import type { Incident } from "@village/shared";
import { listIncidents } from "../api/endpoints";
import { ReportHero } from "../components/ReportHero";
import { IncidentMap, type IncidentMarker } from "../map/IncidentMap";
import { navigate } from "../router/router";
import styles from "./MapScreen.module.css";

export function MapScreen() {
  const [markers, setMarkers] = useState<IncidentMarker[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const incidents = await listIncidents();
        if (cancelled) return;
        setMarkers(
          incidents
            .filter((i: Incident) => i.geo !== null)
            .map((i) => ({ id: i.id, lat: i.geo!.lat, lng: i.geo!.lng, level: i.level })),
        );
      } catch {
        if (!cancelled) setMarkers([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className={styles.wrap}>
      <ReportHero />
      <h1 className={styles.title}>Карта</h1>
      <div className={styles.map}>
        <IncidentMap mode="display" markers={markers} onMarkerClick={(id) => navigate(`/i/${id}`)} />
      </div>
    </section>
  );
}
