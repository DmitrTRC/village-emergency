import { z } from "zod";
import {
  Incident,
  IncidentThread,
  CreateIncidentResponse,
  UploadStatus,
  Role,
} from "@village/shared";
import type { NewIncidentInput, CloseReason, PushSubscriptionDTO } from "@village/shared";
import { apiFetch } from "./client";

const seg = (v: string) => encodeURIComponent(v);

const AuthTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

const ExchangeResponse = AuthTokens.extend({
  user: z.object({ id: z.string().uuid(), name: z.string(), role: Role }),
});

const CommentCreated = z.object({ id: z.string().uuid(), text: z.string() });

const MediaPatchResult = z.object({ uploadStatus: UploadStatus });

const RegistrationRequest = z.object({
  id: z.string().uuid(),
  telegramUserId: z.string(),
  name: z.string(),
  claimedHouseAddress: z.string(),
  phone: z.string().nullable(),
  status: z.enum(["pending", "approved", "rejected"]),
  createdAt: z.string().datetime({ offset: true }),
  decidedAt: z.string().datetime({ offset: true }).nullable(),
  decidedBy: z.string().uuid().nullable(),
});

export type RegistrationRequest = z.infer<typeof RegistrationRequest>;

// --- auth (public) ---

export const exchangeToken = (token: string) =>
  apiFetch("/auth/tg/exchange", {
    method: "POST",
    body: { token },
    schema: ExchangeResponse,
    auth: false,
  });

export const refreshSession = (refreshToken: string) =>
  apiFetch("/auth/refresh", {
    method: "POST",
    body: { refreshToken },
    schema: AuthTokens,
    auth: false,
  });

// --- incidents ---

export const listIncidents = () =>
  apiFetch("/incidents", { schema: z.array(Incident) });

export const getIncidentById = (id: string) =>
  apiFetch(`/incidents/${seg(id)}`, { schema: Incident });

export const getIncidentThread = (id: string) =>
  apiFetch(`/incidents/${seg(id)}/thread`, { schema: IncidentThread });

export const createIncident = (input: NewIncidentInput) =>
  apiFetch("/incidents", {
    method: "POST",
    body: input,
    schema: CreateIncidentResponse,
  });

export const acceptIncident = (id: string) =>
  apiFetch(`/incidents/${seg(id)}/accept`, { method: "POST", schema: Incident });

export const closeIncident = (id: string, reason: CloseReason) =>
  apiFetch(`/incidents/${seg(id)}/close`, {
    method: "POST",
    body: { reason },
    schema: Incident,
  });

export const addComment = (id: string, text: string) =>
  apiFetch(`/incidents/${seg(id)}/comments`, {
    method: "POST",
    body: { text },
    schema: CommentCreated,
  });

export const markMediaUploaded = (incidentId: string, mediaId: string) =>
  apiFetch(`/incidents/${seg(incidentId)}/media/${seg(mediaId)}`, {
    method: "PATCH",
    body: { uploaded: true },
    schema: MediaPatchResult,
  });

export const savePushSubscription = (sub: PushSubscriptionDTO) =>
  apiFetch("/push/subscription", {
    method: "PUT",
    body: sub,
    schema: z.object({ ok: z.literal(true) }),
  });

// --- registrations (commander-only on server) ---

export const listPendingRegistrations = () =>
  apiFetch("/registrations", { schema: z.array(RegistrationRequest) });

export const approveRegistration = (id: string) =>
  apiFetch(`/registrations/${seg(id)}/approve`, {
    method: "POST",
    schema: z.object({ ok: z.literal(true), userId: z.string().uuid() }),
  });

export const rejectRegistration = (id: string) =>
  apiFetch(`/registrations/${seg(id)}/reject`, {
    method: "POST",
    schema: z.object({ ok: z.literal(true) }),
  });
