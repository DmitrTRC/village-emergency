import type { FeedItem } from "../feed/merge";
import { LEVEL_LABEL, STATUS_LABEL, VISIBILITY_LABEL } from "../feed/labels";
import { Link } from "../router/router";
import styles from "./IncidentCard.module.css";

export function IncidentCard({ item }: { item: FeedItem }) {
  const body = (
    <article className={styles.card} data-level={item.level} data-status={item.status}>
      <header className={styles.head}>
        <span className={styles.badge} data-testid="level-badge">{LEVEL_LABEL[item.level]}</span>
        <span className={styles.status} data-testid="status-badge">
          {item.pending ? "⏳ " : ""}
          {STATUS_LABEL[item.status]}
        </span>
        {item.visibility && (
          <span data-testid="visibility-badge">{VISIBILITY_LABEL[item.visibility]}</span>
        )}
      </header>
      {item.text && <p className={styles.text}>{item.text}</p>}
    </article>
  );

  if (item.pending) return body;
  return <Link className={styles.link} to={`/i/${item.id}`}>{body}</Link>;
}
