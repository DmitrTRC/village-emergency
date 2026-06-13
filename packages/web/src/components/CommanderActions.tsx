import { useState } from "react";
import type { CloseReason, Incident, Role } from "@village/shared";
import { acceptIncident, closeIncident } from "../api/endpoints";
import { CLOSE_REASON_LABEL } from "../feed/labels";

const REASONS: CloseReason[] = ["resolved", "false", "duplicate"];

export function CommanderActions({
  incident,
  role,
  onUpdated,
}: {
  incident: Incident;
  role: Role | null;
  onUpdated: (incident: Incident) => void;
}) {
  const [reason, setReason] = useState<CloseReason | "">("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (role !== "commander") return null;

  const canAccept = incident.status === "delivered";
  const canClose = incident.status === "delivered" || incident.status === "accepted";
  if (!canAccept && !canClose) return null;

  const run = async (op: () => Promise<Incident>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onUpdated(await op());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="commander-actions">
      {canAccept && (
        <button type="button" disabled={busy} onClick={() => void run(() => acceptIncident(incident.id))}>
          Принять
        </button>
      )}
      {canClose && (
        <>
          <label>
            Причина
            <select value={reason} onChange={(e) => setReason(e.target.value as CloseReason | "")}>
              <option value="">— выберите —</option>
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {CLOSE_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || reason === ""}
            onClick={() => reason !== "" && void run(() => closeIncident(incident.id, reason))}
          >
            Закрыть
          </button>
          <button type="button" disabled={busy} onClick={() => void run(() => closeIncident(incident.id, "false"))}>
            Отклонить
          </button>
        </>
      )}
      {failed && <p role="alert">Не удалось выполнить действие.</p>}
    </section>
  );
}
