import { useState, type FormEvent } from "react";
import type { IncidentComment, IncidentStatus } from "@village/shared";
import { addComment } from "../api/endpoints";

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
    <section data-testid="comments">
      <h2>Комментарии</h2>
      <ul>
        {comments.map((c) => (
          <li key={c.id}>
            <p>{c.text}</p>
            <time dateTime={c.createdAt}>{formatAt(c.createdAt)}</time>
          </li>
        ))}
      </ul>
      {status === "closed" ? (
        <p data-testid="frozen">Тред заморожен.</p>
      ) : status === "accepted" ? (
        <form onSubmit={submit}>
          <label>
            Комментарий
            <textarea
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <button type="submit" disabled={busy}>
            Отправить
          </button>
          {failed && <p role="alert">Не удалось отправить.</p>}
        </form>
      ) : null}
    </section>
  );
}
