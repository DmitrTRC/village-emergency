import type { IncidentLevel, IncidentStatus, Visibility, Role } from "@village/shared";

export interface Viewer {
  id: string;
  role: Role;
}

export interface IncidentView {
  authorId: string;
  level: IncidentLevel;
  status: IncidentStatus;
  visibility: Visibility;
}

export function canView(viewer: Viewer, i: IncidentView): boolean {
  if (i.visibility === "public") return true;
  if (viewer.role === "commander") return true;
  return viewer.id === i.authorId;
}

export function canAccept(viewer: Viewer, i: IncidentView): boolean {
  return viewer.role === "commander" && i.status === "delivered";
}

export function canClose(viewer: Viewer, i: IncidentView): boolean {
  return viewer.role === "commander" && (i.status === "delivered" || i.status === "accepted");
}

export function canComment(viewer: Viewer, i: IncidentView): boolean {
  return i.status === "accepted" && canView(viewer, i);
}

export function canHideComment(viewer: Viewer): boolean {
  return viewer.role === "commander";
}
