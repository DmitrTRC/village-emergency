import { useCallback, useEffect, useState } from "react";
import { listIncidents } from "../api/endpoints";
import { IncidentCard } from "../components/IncidentCard";
import { ReportHero } from "../components/ReportHero";
import { list as outboxList } from "../db/outbox";
import { mergeFeed, type FeedItem } from "../feed/merge";
import { useEventStream } from "../sse/useEventStream";
import styles from "./Feed.module.css";

export function Feed({ filter }: { filter?: (item: FeedItem) => boolean } = {}) {
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
  if (!items) {
    return (
      <>
        <ReportHero />
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </>
    );
  }

  const visible = filter ? items.filter(filter) : items;

  return (
    <>
      <ReportHero />
      <section>
        <h1 className={styles.title}>Лента</h1>
        {visible.length === 0 ? (
          <p className={styles.empty}>Пока нет инцидентов.</p>
        ) : (
          <ul className={styles.list}>
            {visible.map((item) => (
              <li key={item.id}>
                <IncidentCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
