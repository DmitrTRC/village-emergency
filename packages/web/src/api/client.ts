import { z } from "zod";
import { config } from "../config";
import { clear, getAccess, loadRefresh, setTokens } from "../auth/session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class Unauthorized extends ApiError {
  constructor() {
    super(401, "unauthorized");
    this.name = "Unauthorized";
  }
}

export interface ApiFetchOptions<T> {
  method?: string;
  body?: unknown;
  schema?: z.ZodType<T>;
  auth?: boolean;
}

const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

const url = (path: string) => `${config.apiBase}${path}`;

let refreshInFlight: Promise<boolean> | null = null;

function refreshTokens(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = await loadRefresh();
  if (!refreshToken) return false;

  const res = await fetch(url("/auth/refresh"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;

  const pair = TokenPair.parse(await res.json());
  await setTokens(pair);
  return true;
}

function send<T>(path: string, opts: ApiFetchOptions<T>): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";

  const access = getAccess();
  if (access && opts.auth !== false) headers.authorization = `Bearer ${access}`;

  return fetch(url(path), {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function parseBody<T>(res: Response, schema?: z.ZodType<T>): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(res.status, "invalid JSON response");
  }
  return schema ? schema.parse(data) : (data as T);
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiFetchOptions<T> = {},
): Promise<T> {
  let res = await send(path, opts);

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      await clear();
      throw new Unauthorized();
    }
    res = await send(path, opts);
    if (res.status === 401) {
      await clear();
      throw new Unauthorized();
    }
  }

  if (!res.ok) throw new ApiError(res.status, `api error ${res.status}`);
  return parseBody(res, opts.schema);
}
