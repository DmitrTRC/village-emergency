import type { IncidentLevel, Visibility } from "@village/shared";
import type { FeedItem } from "./merge";

export const LEVEL_LABEL: Record<IncidentLevel, string> = {
  emergency: "Тревога",
  offence: "Правонарушение",
  attention: "Внимание",
};

export const STATUS_LABEL: Record<FeedItem["status"], string> = {
  draft: "Черновик",
  delivered: "Доставлено",
  accepted: "Принято",
  closed: "Закрыто",
  pending: "ожидает сети",
};

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: "Личное",
  public: "Общее",
};
