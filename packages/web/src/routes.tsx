import { useEffect } from "react";
import { useAuth } from "./auth/AuthProvider";
import { getAccess } from "./auth/session";
import { isPublicRoute, matchRoute } from "./router/match";
import { navigate, useLocation } from "./router/router";
import { AuthCallback } from "./screens/AuthCallback";
import { CreateIncident } from "./screens/CreateIncident";
import { Feed } from "./screens/Feed";
import { IncidentDetail } from "./screens/IncidentDetail";
import { MapScreen } from "./screens/MapScreen";
import { More } from "./screens/More";
import { MyIncidents } from "./screens/MyIncidents";
import { NotFound } from "./screens/NotFound";
import { Register } from "./screens/Register";

export function Routes() {
  const path = useLocation();
  const { status } = useAuth();
  const route = matchRoute(path);
  // getAccess() устанавливается синхронно в setTokens — учитываем его, чтобы
  // не редиректить на /register, пока состояние status ещё не догнало логин.
  const gated = !isPublicRoute(route) && status === "anon" && getAccess() === null;

  useEffect(() => {
    if (gated && path !== "/register") navigate("/register");
  }, [gated, path]);

  if (status === "loading") return <p>Загрузка…</p>;
  if (gated) return <Register />;

  switch (route.name) {
    case "feed":
      return <Feed />;
    case "detail":
      return <IncidentDetail id={route.id} />;
    case "create":
      return <CreateIncident />;
    case "map":
      return <MapScreen />;
    case "mine":
      return <MyIncidents />;
    case "more":
      return <More />;
    case "register":
      return <Register />;
    case "callback":
      return <AuthCallback />;
    default:
      return <NotFound />;
  }
}
