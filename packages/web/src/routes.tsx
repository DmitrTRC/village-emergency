import { useEffect } from "react";
import { useAuth } from "./auth/AuthProvider";
import { isPublicRoute, matchRoute } from "./router/match";
import { navigate, useLocation } from "./router/router";
import { AuthCallback } from "./screens/AuthCallback";
import { CreateIncident } from "./screens/CreateIncident";
import { Feed } from "./screens/Feed";
import { IncidentDetail } from "./screens/IncidentDetail";
import { NotFound } from "./screens/NotFound";
import { Register } from "./screens/Register";

export function Routes() {
  const path = useLocation();
  const { status } = useAuth();
  const route = matchRoute(path);
  const gated = !isPublicRoute(route) && status === "anon";

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
    case "register":
      return <Register />;
    case "callback":
      return <AuthCallback />;
    default:
      return <NotFound />;
  }
}
