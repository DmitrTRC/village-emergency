import { lazy, Suspense, useState } from "react";
import { IncidentLevel, NewIncidentInput, type Geo } from "@village/shared";
import { captureGeo } from "../geo/capture";
import { compress } from "../media/compress";
import { enqueue } from "../db/outbox";
import { drainOutbox } from "../db/sync";
import type { OutboxMedia } from "../db/idb";
import { LEVEL_LABEL } from "../feed/labels";
import { Link, navigate } from "../router/router";
import styles from "./CreateIncident.module.css";

const IncidentMap = lazy(() => import("../map/IncidentMap"));

const MAX_PHOTOS = 5;
const LEVELS = IncidentLevel.options;

interface Photo extends OutboxMedia {
  preview: string;
}

export function CreateIncident() {
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("attention");
  const [text, setText] = useState("");
  const [geo, setGeo] = useState<Geo | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setGeoFromMap(coords: { lat: number; lng: number }) {
    setGeo({
      lat: coords.lat,
      lng: coords.lng,
      accuracyM: null,
      capturedAt: new Date().toISOString(),
    });
  }

  async function onPickGeo() {
    setGeoBusy(true);
    try {
      setGeo(await captureGeo());
    } finally {
      setGeoBusy(false);
    }
  }

  async function onPickPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const added: Photo[] = [];
    for (const file of picked) {
      const blob = await compress(file);
      added.push({
        id: crypto.randomUUID(),
        blob,
        mime: blob.type || "image/webp",
        preview: URL.createObjectURL(blob),
      });
    }
    setPhotos((prev) => [...prev, ...added]);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function onSubmit() {
    setError(null);
    const media: OutboxMedia[] = photos.map(({ id, blob, mime }) => ({ id, blob, mime }));
    const input = {
      id: crypto.randomUUID(),
      level,
      ...(text.trim() ? { text: text.trim() } : {}),
      ...(geo ? { geo } : {}),
      ...(media.length
        ? {
            media: media.map((m) => ({
              id: m.id,
              kind: "photo" as const,
              mime: m.mime,
              bytes: m.blob.size,
            })),
          }
        : {}),
    };

    const parsed = NewIncidentInput.safeParse(input);
    if (!parsed.success) {
      setError("Добавьте описание, фото или геопозицию");
      return;
    }

    setSubmitting(true);
    try {
      await enqueue(parsed.data, media);
      void drainOutbox();
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      navigate("/");
    } catch {
      setError("Не удалось сохранить. Попробуйте ещё раз.");
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.wrap}>
      <Link to="/" className={styles.btn} aria-label="Назад">← Назад</Link>
      <h1 className={styles.title}>Новый инцидент</h1>

      <fieldset className={styles.levels}>
        <legend>Уровень</legend>
        {LEVELS.map((lvl) => (
          <label key={lvl}>
            <input
              type="radio"
              name="level"
              value={lvl}
              checked={level === lvl}
              onChange={() => setLevel(lvl)}
            />
            {LEVEL_LABEL[lvl]}
          </label>
        ))}
      </fieldset>

      <textarea
        className={styles.text}
        aria-label="Описание"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Что случилось?"
      />

      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={onPickGeo} disabled={geoBusy}>
          {geoBusy ? "Определяю…" : "Геолокация"}
        </button>
        {geo && (
          <span className={styles.geo} data-testid="geo-indicator">
            {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
          </span>
        )}
        <button type="button" className={styles.btn} onClick={() => setShowMap((v) => !v)}>
          {showMap ? "Скрыть карту" : "Указать на карте"}
        </button>
      </div>

      {showMap && (
        <Suspense fallback={<p>Загрузка карты…</p>}>
          <IncidentMap
            mode="pick"
            value={geo ? { lat: geo.lat, lng: geo.lng } : null}
            onChange={setGeoFromMap}
          />
        </Suspense>
      )}

      <div>
        <label>
          Фото (до {MAX_PHOTOS})
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="photo-input"
            onChange={(e) => void onPickPhotos(e.target.files)}
          />
        </label>
        <ul className={styles.photos}>
          {photos.map((p) => (
            <li key={p.id} data-testid="photo-preview">
              <img src={p.preview} alt="" width={64} height={64} />
              <button type="button" onClick={() => removePhoto(p.id)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button type="button" className={styles.submit} onClick={() => void onSubmit()} disabled={submitting}>
        Отправить
      </button>
    </section>
  );
}
