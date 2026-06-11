import { desc, eq, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { incidents, incidentMedia, incidentEvents } from "../db/schema.js";
import type { NewIncidentInput, Incident } from "@village/shared";
import { transition, type IncidentState } from "../domain/lifecycle.js";
import type { Viewer } from "../domain/policy.js";

function s3KeyFor(incidentId: string, mediaId: string, kind: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = kind === "photo" ? "webp" : "webm";
  return `incidents/${yyyy}/${mm}/${incidentId}/${mediaId}.${ext}`;
}

interface UploadStub { mediaId: string; s3Key: string; }

function rowToIncident(r: typeof incidents.$inferSelect): Incident {
  return {
    id: r.id,
    authorId: r.authorId,
    level: r.level,
    status: r.status,
    visibility: r.visibility,
    closeReason: r.closeReason,
    text: r.text,
    geo:
      r.geoLat !== null && r.geoLng !== null
        ? {
            lat: r.geoLat / 1e6,
            lng: r.geoLng / 1e6,
            accuracyM: r.geoAccuracyM,
            capturedAt: (r.geoCapturedAt ?? new Date()).toISOString(),
          }
        : null,
    createdAtClient: r.createdAtClient.toISOString(),
    deliveredAtServer: r.deliveredAtServer?.toISOString() ?? null,
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
  };
}

export async function createIncident(
  db: Db,
  authorId: string,
  input: NewIncidentInput,
): Promise<{ incident: Incident; uploads: UploadStub[] }> {
  const existing = await db.query.incidents.findFirst({ where: eq(incidents.id, input.id) });
  if (existing) {
    const uploads = (
      await db.query.incidentMedia.findMany({ where: eq(incidentMedia.incidentId, input.id) })
    ).map((m) => ({ mediaId: m.id, s3Key: m.s3Key }));
    return { incident: rowToIncident(existing), uploads };
  }

  const draft: IncidentState = {
    level: input.level, status: "draft", visibility: "private", closeReason: null,
  };
  const delivered = transition(draft, { type: "deliver" });
  const now = new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(incidents)
      .values({
        id: input.id,
        authorId,
        level: input.level,
        status: delivered.status,
        visibility: delivered.visibility,
        text: input.text ?? null,
        geoLat: input.geo ? Math.round(input.geo.lat * 1e6) : null,
        geoLng: input.geo ? Math.round(input.geo.lng * 1e6) : null,
        geoAccuracyM: input.geo?.accuracyM ?? null,
        geoCapturedAt: input.geo ? new Date(input.geo.capturedAt) : null,
        createdAtClient: now,
        deliveredAtServer: now,
      })
      .returning();

    const uploads: UploadStub[] = [];
    for (const m of input.media ?? []) {
      const s3Key = s3KeyFor(input.id, m.id, m.kind);
      await tx.insert(incidentMedia).values({
        id: m.id, incidentId: input.id, kind: m.kind, s3Key, mime: m.mime, bytes: m.bytes,
      });
      uploads.push({ mediaId: m.id, s3Key });
    }

    await tx.insert(incidentEvents).values([
      { incidentId: input.id, actorId: authorId, type: "created", payload: { level: input.level } },
      { incidentId: input.id, actorId: authorId, type: "delivered", payload: null },
    ]);

    return { incident: rowToIncident(row!), uploads };
  });
}

export async function getIncident(db: Db, id: string): Promise<Incident | null> {
  const r = await db.query.incidents.findFirst({ where: eq(incidents.id, id) });
  return r ? rowToIncident(r) : null;
}

export async function listVisible(db: Db, viewer: Viewer): Promise<Incident[]> {
  const where =
    viewer.role === "commander"
      ? undefined
      : or(eq(incidents.visibility, "public"), eq(incidents.authorId, viewer.id));
  const rows = await db.query.incidents.findMany({
    where, orderBy: [desc(incidents.deliveredAtServer)],
  });
  return rows.map(rowToIncident);
}
