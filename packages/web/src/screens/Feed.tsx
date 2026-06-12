import { useEffect, useState } from "react";
import { listIncidents } from "../api/endpoints";
import { IncidentCard } from "../components/IncidentCard";
import { list as outboxList } from "../db/outbox";
import { mergeFeed, type FeedItem } from "../feed/merge";

export function Feed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [incidents, outbox] = await Promise.all([listIncidents(), outboxList()]);
        if (!cancelled) setItems(mergeFeed(incidents, outbox));
      } catch {
        try {
          const outbox = await outboxList();
          if (!cancelled) setItems(mergeFeed([], outbox));
        } catch {
          if (!cancelled) setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p>Не удалось загрузить ленту.</p>;
  if (!items) return <p>Загрузка…</p>;

  return (
    <section>
      <h1>Лента</h1>
      {items.length === 0 ? (
        <p>Пока нет инцидентов.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <IncidentCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
