import type { CloseReason, IncidentEventType, IncidentLevel, Visibility } from "@village/shared";
import type { FeedItem } from "./merge";

export const LEVEL_LABEL: Record<IncidentLevel, string> = {
  emergency: "Тревога",
  offence: "Правонарушение",
  attention: "Внимание",
};

export const LEVEL_COLOR: Record<IncidentLevel, string> = {
  emergency: "#ff3b3b",
  offence: "#ffb020",
  attention: "#3d8bff",
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

export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  resolved: "Решено",
  false: "Ложная тревога",
  duplicate: "Дубликат",
};

export const EVENT_LABEL: Record<IncidentEventType, string> = {
  created: "Создан",
  delivered: "Доставлен",
  accepted: "Принят",
  closed: "Закрыт",
  commented: "Комментарий",
  hidden: "Скрыт",
  reopened: "Переоткрыт",
};
