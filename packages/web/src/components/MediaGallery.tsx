import type { IncidentMediaView } from "@village/shared";
import styles from "./MediaGallery.module.css";

export function MediaGallery({ media }: { media: IncidentMediaView[] }) {
  if (media.length === 0) return null;
  return (
    <div className={styles.grid} data-testid="media-gallery">
      {media.map((m) =>
        m.kind === "photo" ? (
          <img key={m.id} className={styles.photo} src={m.url} alt="фото инцидента" loading="lazy" />
        ) : (
          <a key={m.id} className={`btn ${styles.file}`} href={m.url}>
            {m.kind === "voice" ? "Аудио" : "Видео"}
          </a>
        ),
      )}
    </div>
  );
}
