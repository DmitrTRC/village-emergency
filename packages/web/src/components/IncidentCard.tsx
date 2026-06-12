import type { FeedItem } from "../feed/merge";
import { LEVEL_LABEL, STATUS_LABEL, VISIBILITY_LABEL } from "../feed/labels";
import { Link } from "../router/router";

export function IncidentCard({ item }: { item: FeedItem }) {
  const body = (
    <article data-level={item.level} data-status={item.status}>
      <header>
        <span data-testid="level-badge">{LEVEL_LABEL[item.level]}</span>
        <span data-testid="status-badge">
          {item.pending ? "⏳ " : ""}
          {STATUS_LABEL[item.status]}
        </span>
        {item.visibility && (
          <span data-testid="visibility-badge">{VISIBILITY_LABEL[item.visibility]}</span>
        )}
      </header>
      {item.text && <p>{item.text}</p>}
    </article>
  );

  if (item.pending) return body;
  return <Link to={`/i/${item.id}`}>{body}</Link>;
}
