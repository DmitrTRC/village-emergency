import { lazy, Suspense, useEffect, useState } from "react";
import type { Incident, IncidentThread } from "@village/shared";
import { ApiError } from "../api/client";
import { getIncidentById, getIncidentThread } from "../api/endpoints";
import { useOptionalAuth } from "../auth/AuthProvider";
import { CommanderActions } from "../components/CommanderActions";
import { Comments } from "../components/Comments";
import { MediaGallery } from "../components/MediaGallery";
import { Timeline } from "../components/Timeline";
import { LEVEL_LABEL, STATUS_LABEL, VISIBILITY_LABEL } from "../feed/labels";
import { Link } from "../router/router";
import styles from "./IncidentDetail.module.css";

const IncidentMap = lazy(() => import("../map/IncidentMap"));

type State =
  | { kind: "loading" }
  | { kind: "forbidden" }
  | { kind: "error" }
  | { kind: "ready"; incident: Incident; thread: IncidentThread };

export function IncidentDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const role = useOptionalAuth()?.user?.role ?? null;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void (async () => {
      try {
        const [incident, thread] = await Promise.all([
          getIncidentById(id),
          getIncidentThread(id),
        ]);
        if (!cancelled) setState({ kind: "ready", incident, thread });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setState({ kind: "forbidden" });
        else setState({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.kind === "loading") return <p>Загрузка…</p>;
  if (state.kind === "forbidden") {
    return (
      <section>
        <h1>Нет доступа</h1>
        <Link to="/">К ленте</Link>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section>
        <h1>Не удалось загрузить инцидент</h1>
        <Link to="/">К ленте</Link>
      </section>
    );
  }

  const { incident, thread } = state;
  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>Инцидент</h1>
      <header className={styles.head}>
        <span className={styles.badge} data-testid="level-badge">{LEVEL_LABEL[incident.level]}</span>
        <span className={styles.badge} data-testid="status-badge">{STATUS_LABEL[incident.status]}</span>
        <span className={styles.badge} data-testid="visibility-badge">{VISIBILITY_LABEL[incident.visibility]}</span>
      </header>
      {incident.text && <p className={styles.text}>{incident.text}</p>}
      {incident.geo && (
        <div className={styles.map}>
          <Suspense fallback={<p>Загрузка карты…</p>}>
            <IncidentMap mode="display" value={{ lat: incident.geo.lat, lng: incident.geo.lng }} />
          </Suspense>
        </div>
      )}
      <CommanderActions
        incident={incident}
        role={role}
        onUpdated={(next) => setState({ kind: "ready", incident: next, thread })}
      />
      <MediaGallery media={thread.media} />
      <Timeline events={thread.events} />
      <Comments incidentId={incident.id} status={incident.status} initial={thread.comments} />
      <Link className={styles.back} to="/">К ленте</Link>
    </section>
  );
}
