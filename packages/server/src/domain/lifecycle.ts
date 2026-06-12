import type {
  IncidentLevel, IncidentStatus, Visibility, CloseReason,
} from "@village/shared";

export interface IncidentState {
  level: IncidentLevel;
  status: IncidentStatus;
  visibility: Visibility;
  closeReason: CloseReason | null;
}

export type Action =
  | { type: "deliver" }
  | { type: "accept" }
  | { type: "close"; reason: CloseReason };

export class IllegalTransition extends Error {
  constructor(status: IncidentStatus, action: Action["type"]) {
    super(`illegal transition: ${action} from ${status}`);
    this.name = "IllegalTransition";
  }
}

export function transition(state: IncidentState, action: Action): IncidentState {
  switch (action.type) {
    case "deliver": {
      if (state.status !== "draft") throw new IllegalTransition(state.status, "deliver");
      return {
        ...state,
        status: "delivered",
        visibility: state.level === "emergency" ? "public" : "private",
      };
    }
    case "accept": {
      if (state.status !== "delivered") throw new IllegalTransition(state.status, "accept");
      return { ...state, status: "accepted", visibility: "public" };
    }
    case "close": {
      if (state.status !== "delivered" && state.status !== "accepted") {
        throw new IllegalTransition(state.status, "close");
      }
      const keepHidden = action.reason === "false";
      return {
        ...state,
        status: "closed",
        closeReason: action.reason,
        visibility: keepHidden ? "private" : state.visibility,
      };
    }
  }
}
