import { useState } from "react";
import { IncidentLevel, NewIncidentInput, type Geo } from "@village/shared";
import { captureGeo } from "../geo/capture";
import { compress } from "../media/compress";
import { enqueue } from "../db/outbox";
import type { OutboxMedia } from "../db/idb";
import { LEVEL_LABEL } from "../feed/labels";
import { navigate } from "../router/router";

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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      photos.forEach((p) => URL.revokeObjectURL(p.preview));
      navigate("/");
    } catch {
      setError("Не удалось сохранить. Попробуйте ещё раз.");
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h1>Новый инцидент</h1>

      <fieldset>
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
        aria-label="Описание"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Что случилось?"
      />

      <div>
        <button type="button" onClick={onPickGeo} disabled={geoBusy}>
          {geoBusy ? "Определяю…" : "Геолокация"}
        </button>
        {geo && (
          <span data-testid="geo-indicator">
            {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
          </span>
        )}
      </div>

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
        <ul>
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

      {error && <p role="alert">{error}</p>}

      <button type="button" onClick={() => void onSubmit()} disabled={submitting}>
        Отправить
      </button>
    </section>
  );
}
