import { useState, type FormEvent } from "react";
import type { IncidentComment, IncidentStatus } from "@village/shared";
import { addComment } from "../api/endpoints";
import styles from "./Comments.module.css";

function formatAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ru-RU");
}

export function Comments({
  incidentId,
  status,
  initial,
}: {
  incidentId: string;
  status: IncidentStatus;
  initial: IncidentComment[];
}) {
  const [comments, setComments] = useState<IncidentComment[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setFailed(false);
    const tempId = crypto.randomUUID();
    const optimistic: IncidentComment = {
      id: tempId,
      authorId: "",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setText("");
    try {
      const created = await addComment(incidentId, trimmed);
      setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: created.id } : c)));
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setText(trimmed);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.wrap} data-testid="comments">
      <h2 className={styles.title}>Комментарии</h2>
      {comments.length > 0 && (
        <ul className={styles.list}>
          {comments.map((c) => (
            <li key={c.id} className={styles.item}>
              <p className={styles.text}>{c.text}</p>
              <time className={styles.time} dateTime={c.createdAt}>{formatAt(c.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
      {status === "closed" ? (
        <p className={styles.frozen} data-testid="frozen">Тред заморожен.</p>
      ) : status === "accepted" ? (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            <span className={styles.label}>Комментарий</span>
            <textarea
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-accent btn-block" disabled={busy}>
            Отправить
          </button>
          {failed && <p className={styles.error} role="alert">Не удалось отправить.</p>}
        </form>
      ) : null}
    </section>
  );
}
