import type { IncidentEvent } from "@village/shared";
import { EVENT_LABEL } from "../feed/labels";
import styles from "./Timeline.module.css";

function formatAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU");
}

export function Timeline({ events }: { events: IncidentEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol className={styles.list} data-testid="timeline">
      {events.map((e) => (
        <li key={e.id} className={styles.item} data-event-type={e.type}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.label}>{EVENT_LABEL[e.type]}</span>
          <time className={styles.time} dateTime={e.at}>{formatAt(e.at)}</time>
        </li>
      ))}
    </ol>
  );
}
