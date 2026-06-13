import type { IncidentEvent } from "@village/shared";
import { EVENT_LABEL } from "../feed/labels";

function formatAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU");
}

export function Timeline({ events }: { events: IncidentEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol data-testid="timeline">
      {events.map((e) => (
        <li key={e.id} data-event-type={e.type}>
          <span>{EVENT_LABEL[e.type]}</span>
          <time dateTime={e.at}>{formatAt(e.at)}</time>
        </li>
      ))}
    </ol>
  );
}
