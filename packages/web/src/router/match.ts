export type Route =
  | { name: "feed" }
  | { name: "detail"; id: string }
  | { name: "create" }
  | { name: "map" }
  | { name: "mine" }
  | { name: "more" }
  | { name: "register" }
  | { name: "callback" }
  | { name: "notFound" };

const DETAIL = /^\/i\/([^/]+)$/;

export function matchRoute(pathname: string): Route {
  switch (pathname) {
    case "/":
      return { name: "feed" };
    case "/new":
      return { name: "create" };
    case "/map":
      return { name: "map" };
    case "/mine":
      return { name: "mine" };
    case "/more":
      return { name: "more" };
    case "/register":
      return { name: "register" };
    case "/auth/callback":
      return { name: "callback" };
  }
  const detail = DETAIL.exec(pathname);
  if (detail) return { name: "detail", id: decodeURIComponent(detail[1]!) };
  return { name: "notFound" };
}

export function isPublicRoute(route: Route): boolean {
  return route.name === "register" || route.name === "callback";
}
