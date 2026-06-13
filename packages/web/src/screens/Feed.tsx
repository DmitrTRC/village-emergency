import { useCallback, useEffect, useState } from "react";
import { listIncidents } from "../api/endpoints";
import { IncidentCard } from "../components/IncidentCard";
import { list as outboxList } from "../db/outbox";
import { mergeFeed, type FeedItem } from "../feed/merge";
import { useEventStream } from "../sse/useEventStream";

export function Feed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [incidents, outbox] = await Promise.all([listIncidents(), outboxList()]);
      setItems(mergeFeed(incidents, outbox));
      setError(false);
    } catch {
      try {
        const outbox = await outboxList();
        setItems(mergeFeed([], outbox));
      } catch {
        setError(true);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEventStream(useCallback(() => void load(), [load]));

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
