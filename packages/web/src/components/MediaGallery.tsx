import type { IncidentMediaView } from "@village/shared";

export function MediaGallery({ media }: { media: IncidentMediaView[] }) {
  if (media.length === 0) return null;
  return (
    <div data-testid="media-gallery">
      {media.map((m) =>
        m.kind === "photo" ? (
          <img key={m.id} src={m.url} alt="фото инцидента" loading="lazy" />
        ) : (
          <a key={m.id} href={m.url}>
            {m.kind === "voice" ? "Аудио" : "Видео"}
          </a>
        ),
      )}
    </div>
  );
}
