import { useRef, useState } from "react";
import type { Geo, NewIncidentInput } from "@village/shared";
import { captureGeo } from "../geo/capture";
import { enqueue } from "../db/outbox";
import { drainOutbox } from "../db/sync";
import styles from "./PanicButton.module.css";

const HOLD_MS = 1500;
type Phase = "idle" | "holding" | "armed" | "sending" | "sent";

const LABEL: Record<Phase, string> = {
  idle: "ТРЕВОГА",
  holding: "Держите…",
  armed: "Отпустите для отправки",
  sending: "Отправляем…",
  sent: "Тревога отправлена",
};

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
}

export function PanicButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<number | null>(null);
  const geo = useRef<Promise<Geo | null> | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function start() {
    if (phase === "sending" || phase === "sent") return;
    geo.current = captureGeo();
    setPhase("holding");
    vibrate(20);
    timer.current = window.setTimeout(() => {
      setPhase("armed");
      vibrate([0, 40]);
    }, HOLD_MS);
  }

  function cancel() {
    clearTimer();
    setPhase((p) => (p === "holding" || p === "armed" ? "idle" : p));
  }

  async function release() {
    clearTimer();
    if (phase !== "armed") {
      setPhase((p) => (p === "holding" ? "idle" : p));
      return;
    }
    setPhase("sending");
    vibrate(60);
    const g = (await geo.current) ?? null;
    const input: NewIncidentInput = {
      id: crypto.randomUUID(),
      level: "emergency",
      ...(g ? { geo: g } : {}),
    };
    await enqueue(input, []);
    void drainOutbox();
    setPhase("sent");
    window.setTimeout(() => setPhase("idle"), 2500);
  }

  return (
    <button
      type="button"
      className={styles.panic}
      data-phase={phase}
      data-testid="panic-button"
      aria-label="Сообщить о тревоге — нажмите и держите"
      onPointerDown={start}
      onPointerUp={() => void release()}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      <span className={styles.label}>{LABEL[phase]}</span>
    </button>
  );
}
