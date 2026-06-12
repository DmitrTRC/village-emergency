export type Route =
  | { name: "feed" }
  | { name: "detail"; id: string }
  | { name: "create" }
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
