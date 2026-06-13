# village-emrg UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Одеть готовый по функциям PWA в тёмный «тревожный» UI: нижний таб-бар (Лента/Карта/Мои/Ещё), sticky кнопку-герой с hold-to-send (паника), спокойный путь для неэкстренного, и закрыть функциональную дыру — недостижимый из UI экран `/new`.

**Architecture:** Только `packages/web`. Серверный API и `@village/shared` не трогаем. Дизайн-токены — один глобальный `src/theme.css`; стили компонентов — CSS Modules (`*.module.css`, Vite поддерживает из коробки). Переиспользуем существующую логику (`enqueue`, `drainOutbox`, `captureGeo`, `IncidentMap`, `Feed`, `useAuth`, `InstallPrompt`). Все существующие `data-testid` и заголовки сохраняем, чтобы не переписывать 101 тест.

**Tech Stack:** React 18, TypeScript, Vite 5, CSS Modules, Vitest 3 + @testing-library/react + jsdom, Playwright (E2E).

**Спек:** `docs/superpowers/specs/2026-06-13-ui-ux-design.md`

---

## File Structure

**Создаём:**
- `src/theme.css` — токены (CSS-переменные) + базовый reset/типографика.
- `src/hooks/useOnlineStatus.ts` — индикатор сети.
- `src/components/PanicButton.tsx` + `.module.css` — красная кнопка (hold-to-send).
- `src/components/ReportHero.tsx` + `.module.css` — PanicButton + ссылка «Сообщить о другом».
- `src/components/Header.tsx` + `.module.css` — шапка (село + сеть).
- `src/components/TabBar.tsx` + `.module.css` — нижняя навигация.
- `src/screens/MapScreen.tsx` + `.module.css` — вкладка «Карта».
- `src/screens/MyIncidents.tsx` — вкладка «Мои» (Feed с фильтром).
- `src/screens/More.tsx` + `.module.css` — вкладка «Ещё».
- CSS-модули рестайла: `Feed.module.css`, `IncidentCard.module.css`, `CreateIncident.module.css`, `IncidentDetail.module.css`, `auth.module.css`.

**Меняем:**
- `src/main.tsx` — импорт `theme.css`.
- `src/config.ts` — добавить `villageName`.
- `src/feed/merge.ts` — `authorId` в `FeedItem`.
- `src/feed/labels.ts` — `LEVEL_COLOR` для маркеров карты.
- `src/screens/Feed.tsx` — опц. проп `filter`, рестайл, скелетон/пустое состояние.
- `src/components/IncidentCard.tsx` — рестайл (хуки `data-level` уже есть).
- `src/router/match.ts` — роуты `map`/`mine`/`more`.
- `src/routes.tsx` — кейсы новых роутов.
- `src/App.tsx` — AppShell (Header + main + TabBar), убрать InstallPrompt из shell.
- `src/map/IncidentMap.tsx` — проп `markers` + `onMarkerClick`.
- `src/screens/CreateIncident.tsx`, `IncidentDetail.tsx`, `Register.tsx`, `AuthCallback.tsx`, `NotFound.tsx` — рестайл.

**Команды (из `packages/web`):**
- Один тест: `pnpm exec vitest run test/<path>` (или `--root packages/web` из корня).
- Все web-тесты: `pnpm -C packages/web test`.
- Типы: `pnpm -C packages/web typecheck`.
- Сборка: `pnpm -C packages/web build`.

> Примечание: дисплейный self-hosted шрифт из спека отложен (бинарный ассет вне объёма плана) — используем системный стек с усиленным весом/трекингом для акцентов. Это обратимо: добавить `@font-face` позже отдельной задачей.

---

### Task 1: Дизайн-токены и глобальный theme.css

**Files:**
- Create: `packages/web/src/theme.css`
- Modify: `packages/web/src/main.tsx`
- Modify: `packages/web/src/config.ts`

- [ ] **Step 1: Создать `src/theme.css`**

```css
:root {
  --bg: #0b1220;
  --surface: #141d2e;
  --surface-2: #1b2740;
  --border: #1d2840;
  --text: #e8edf6;
  --muted: #5f7088;
  --online: #3ddc84;
  --offline: #ffb020;

  --emergency: #ff3b3b;
  --offence: #ffb020;
  --attention: #3d8bff;

  --radius: 12px;
  --radius-lg: 18px;
  --tap: 56px;
  --space: 4px;
  --maxw: 560px;

  --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  --font-display: var(--font-body);
}

* { box-sizing: border-box; }
html, body, #root { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.4;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
button { font: inherit; cursor: pointer; color: inherit; }
a { color: var(--attention); text-decoration: none; }
h1, h2, h3 { font-family: var(--font-display); }
:focus-visible { outline: 2px solid var(--attention); outline-offset: 2px; }
```

- [ ] **Step 2: Импортировать тему в `src/main.tsx`** (первой строкой импортов)

```tsx
import "./theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 3: Добавить `villageName` в `src/config.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  VITE_API_BASE: z.string().default(""),
  VITE_VAPID_PUBLIC_KEY: z.string().optional(),
  VITE_TG_BOT: z.string().optional(),
  VITE_MAP_TILE_URL: z
    .string()
    .default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  VITE_VILLAGE_NAME: z.string().default("Наше село"),
});

const env = schema.parse(import.meta.env);

export const config = {
  apiBase: env.VITE_API_BASE,
  vapidPublicKey: env.VITE_VAPID_PUBLIC_KEY,
  tgBot: env.VITE_TG_BOT,
  mapTileUrl: env.VITE_MAP_TILE_URL,
  villageName: env.VITE_VILLAGE_NAME,
} as const;
```

- [ ] **Step 4: Прогнать типы, сборку и существующие тесты**

Run: `pnpm -C packages/web typecheck && pnpm -C packages/web test`
Expected: типы чистые; все существующие тесты PASS (импорт css не ломает jsdom).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/theme.css packages/web/src/main.tsx packages/web/src/config.ts
git commit -m "feat(web): дизайн-токены и глобальная тёмная тема"
```

---

### Task 2: `authorId` в FeedItem (для вкладки «Мои»)

**Files:**
- Modify: `packages/web/src/feed/merge.ts`
- Test: `packages/web/test/feed/merge.test.ts`

- [ ] **Step 1: Дописать падающий тест** (добавить в существующий `describe`)

```ts
test("authorId протаскивается из инцидента, у pending — null", () => {
  const incident = {
    id: "11111111-1111-4111-8111-111111111111",
    authorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    level: "offence",
    status: "delivered",
    visibility: "public",
    closeReason: null,
    text: "x",
    geo: null,
    createdAtClient: "2026-06-13T10:00:00.000Z",
    deliveredAtServer: null,
    acceptedAt: null,
    closedAt: null,
  } as const;
  const outbox = {
    id: "22222222-2222-4222-8222-222222222222",
    input: { id: "22222222-2222-4222-8222-222222222222", level: "emergency" },
    media: [],
    status: "pending",
    createdAtClient: "2026-06-13T11:00:00.000Z",
  } as const;

  const [pending, server] = mergeFeed([incident], [outbox]);
  expect(server.authorId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  expect(pending.authorId).toBeNull();
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm -C packages/web exec vitest run test/feed/merge.test.ts`
Expected: FAIL (`authorId` отсутствует в типе/значении).

- [ ] **Step 3: Добавить поле в `merge.ts`**

```ts
export interface FeedItem {
  id: string;
  authorId: string | null;
  level: IncidentLevel;
  status: IncidentStatus | "pending";
  visibility: Visibility | null;
  text: string | null;
  createdAt: string;
  pending: boolean;
}

function fromIncident(i: Incident): FeedItem {
  return {
    id: i.id,
    authorId: i.authorId,
    level: i.level,
    status: i.status,
    visibility: i.visibility,
    text: i.text,
    createdAt: i.createdAtClient,
    pending: false,
  };
}

function fromOutbox(o: OutboxItem): FeedItem {
  const input = o.input as { level: IncidentLevel; text?: string | null };
  return {
    id: o.id,
    authorId: null,
    level: input.level,
    status: "pending",
    visibility: null,
    text: input.text ?? null,
    createdAt: o.createdAtClient,
    pending: true,
  };
}
```
(`mergeFeed` ниже не меняется.)

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/feed/merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/feed/merge.ts packages/web/test/feed/merge.test.ts
git commit -m "feat(web): authorId в FeedItem для фильтра «Мои»"
```

---

### Task 3: Опциональный `filter` у Feed

**Files:**
- Modify: `packages/web/src/screens/Feed.tsx`
- Test: `packages/web/test/feed/Feed.test.tsx`

- [ ] **Step 1: Дописать падающий тест** (добавить в `describe("Feed")`)

```ts
test("filter оставляет только подходящие карточки", async () => {
  const mine = { ...incident, id: "33333333-3333-4333-8333-333333333333", text: "моё", authorId: "me" };
  const alien = { ...incident, id: "44444444-4444-4444-8444-444444444444", text: "чужое", authorId: "other" };
  h.listIncidents.mockResolvedValue([mine, alien]);
  h.outboxList.mockResolvedValue([]);

  render(<Feed filter={(it) => it.authorId === "me"} />);

  expect(await screen.findByText("моё")).toBeInTheDocument();
  expect(screen.queryByText("чужое")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/feed/Feed.test.tsx`
Expected: FAIL (`Feed` не принимает `filter`).

- [ ] **Step 3: Добавить проп в `Feed.tsx`** (меняется сигнатура и применение фильтра; остальное без изменений)

```tsx
import type { FeedItem } from "../feed/merge";
// ...
export function Feed({ filter }: { filter?: (item: FeedItem) => boolean } = {}) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState(false);
  // load() без изменений ...

  if (error) return <p>Не удалось загрузить ленту.</p>;
  if (!items) return <p>Загрузка…</p>;

  const visible = filter ? items.filter(filter) : items;

  return (
    <section>
      <h1>Лента</h1>
      {visible.length === 0 ? (
        <p>Пока нет инцидентов.</p>
      ) : (
        <ul>
          {visible.map((item) => (
            <li key={item.id}>
              <IncidentCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Запустить — PASS (и не сломаны старые тесты Feed)**

Run: `pnpm -C packages/web exec vitest run test/feed/Feed.test.tsx`
Expected: PASS (заголовок «Лента» сохранён).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/Feed.tsx packages/web/test/feed/Feed.test.tsx
git commit -m "feat(web): опциональный filter в Feed"
```

---

### Task 4: Хук `useOnlineStatus`

**Files:**
- Create: `packages/web/src/hooks/useOnlineStatus.ts`
- Test: `packages/web/test/hooks/useOnlineStatus.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useOnlineStatus } from "../../src/hooks/useOnlineStatus";

afterEach(cleanup);

function Probe() {
  return <span>{useOnlineStatus() ? "online" : "offline"}</span>;
}

describe("useOnlineStatus", () => {
  test("реагирует на события online/offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<Probe />);
    expect(screen.getByText("online")).toBeInTheDocument();

    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText("offline")).toBeInTheDocument();

    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("online")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/hooks/useOnlineStatus.test.tsx`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать хук**

```ts
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/hooks/useOnlineStatus.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useOnlineStatus.ts packages/web/test/hooks/useOnlineStatus.test.tsx
git commit -m "feat(web): хук useOnlineStatus"
```

---

### Task 5: Роуты map / mine / more

**Files:**
- Modify: `packages/web/src/router/match.ts`
- Test: `packages/web/test/router/match.test.ts`

- [ ] **Step 1: Дописать падающие тесты** (в `describe("matchRoute")`)

```ts
test("новые статические вкладки", () => {
  expect(matchRoute("/map")).toEqual({ name: "map" });
  expect(matchRoute("/mine")).toEqual({ name: "mine" });
  expect(matchRoute("/more")).toEqual({ name: "more" });
});

test("новые вкладки приватные", () => {
  expect(isPublicRoute({ name: "map" })).toBe(false);
  expect(isPublicRoute({ name: "mine" })).toBe(false);
  expect(isPublicRoute({ name: "more" })).toBe(false);
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/router/match.test.ts`
Expected: FAIL (нет вариантов в типе/switch).

- [ ] **Step 3: Расширить `match.ts`**

```ts
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
```

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/router/match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/router/match.ts packages/web/test/router/match.test.ts
git commit -m "feat(web): роуты map/mine/more"
```

---

### Task 6: `PanicButton` — красная кнопка hold-to-send

**Files:**
- Create: `packages/web/src/components/PanicButton.tsx`
- Create: `packages/web/src/components/PanicButton.module.css`
- Test: `packages/web/test/components/PanicButton.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  enqueue: vi.fn(),
  drainOutbox: vi.fn(),
  captureGeo: vi.fn(),
}));
vi.mock("../../src/db/outbox", () => ({ enqueue: h.enqueue }));
vi.mock("../../src/db/sync", () => ({ drainOutbox: h.drainOutbox }));
vi.mock("../../src/geo/capture", () => ({ captureGeo: h.captureGeo }));

import { PanicButton } from "../../src/components/PanicButton";

beforeEach(() => {
  vi.useFakeTimers();
  h.enqueue.mockResolvedValue(undefined);
  h.captureGeo.mockResolvedValue({
    lat: 55.7, lng: 37.6, accuracyM: 10, capturedAt: "2026-06-13T10:00:00.000Z",
  });
  (navigator as unknown as { vibrate: unknown }).vibrate = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("PanicButton", () => {
  test("удержание до порога → отпустил → emergency с гео", async () => {
    render(<PanicButton />);
    const btn = screen.getByTestId("panic-button");

    fireEvent.pointerDown(btn);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(btn).toHaveTextContent("Отпустите для отправки");

    await act(async () => { fireEvent.pointerUp(btn); });
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    const [input, media] = h.enqueue.mock.calls[0]!;
    expect(input.level).toBe("emergency");
    expect(input.geo).toMatchObject({ lat: 55.7, lng: 37.6 });
    expect(media).toEqual([]);
    expect(h.drainOutbox).toHaveBeenCalled();
  });

  test("ранний отпуск до порога → ничего не отправляется", () => {
    render(<PanicButton />);
    const btn = screen.getByTestId("panic-button");
    fireEvent.pointerDown(btn);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.pointerUp(btn);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  test("вибро на старте и на пороге", () => {
    render(<PanicButton />);
    fireEvent.pointerDown(screen.getByTestId("panic-button"));
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(navigator.vibrate).toHaveBeenCalledWith([0, 40]);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/components/PanicButton.test.tsx`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `PanicButton.tsx`**

```tsx
import { useRef, useState } from "react";
import type { Geo, NewIncidentInput } from "@village/shared";
import { captureGeo } from "../geo/capture";
import { enqueue } from "../db/outbox";
import { drainOutbox } from "../db/sync";
import styles from "./PanicButton.module.css";

const HOLD_MS = 1500;
type Phase = "idle" | "holding" | "armed" | "sending" | "sent";

const LABEL: Record<Phase, string> = {
  idle: "СООБЩИТЬ",
  holding: "Держите…",
  armed: "Отпустите для отправки",
  sending: "Отправляем…",
  sent: "Тревога отправлена",
};

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
}

export function PanicButton() {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<number | null>(null);
  const geo = useRef<Promise<Geo | null> | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function start() {
    if (phase === "sending" || phase === "sent") return;
    geo.current = captureGeo();
    setPhase("holding");
    vibrate(20);
    timer.current = window.setTimeout(() => {
      setPhase("armed");
      vibrate([0, 40]);
    }, HOLD_MS);
  }

  function cancel() {
    clearTimer();
    setPhase((p) => (p === "holding" || p === "armed" ? "idle" : p));
  }

  async function release() {
    clearTimer();
    if (phase !== "armed") {
      setPhase((p) => (p === "holding" ? "idle" : p));
      return;
    }
    setPhase("sending");
    vibrate(60);
    const g = (await geo.current) ?? null;
    const input: NewIncidentInput = {
      id: crypto.randomUUID(),
      level: "emergency",
      ...(g ? { geo: g } : {}),
    };
    await enqueue(input, []);
    void drainOutbox();
    setPhase("sent");
    window.setTimeout(() => setPhase("idle"), 2500);
  }

  return (
    <button
      type="button"
      className={styles.panic}
      data-phase={phase}
      data-testid="panic-button"
      aria-label="Сообщить о тревоге — нажмите и держите"
      onPointerDown={start}
      onPointerUp={() => void release()}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      <span className={styles.label}>{LABEL[phase]}</span>
    </button>
  );
}
```

- [ ] **Step 4: Реализовать `PanicButton.module.css`**

```css
.panic {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 84px;
  padding: 20px;
  border: none;
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, #ff4d4d, #e02424);
  color: #fff;
  font-weight: 800;
  font-size: 22px;
  letter-spacing: 0.05em;
  box-shadow: 0 8px 24px rgba(255, 59, 59, 0.45);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.08s ease;
}
.panic[data-phase="holding"],
.panic[data-phase="armed"] { transform: scale(0.98); }
.panic[data-phase="armed"] { animation: pulse 0.8s ease-in-out infinite; }
.panic[data-phase="sent"] { background: linear-gradient(180deg, #2fa85a, #1f8a47); }
.label { pointer-events: none; }

@keyframes pulse {
  0%, 100% { box-shadow: 0 8px 24px rgba(255, 59, 59, 0.45); }
  50% { box-shadow: 0 8px 36px rgba(255, 59, 59, 0.85); }
}
@media (prefers-reduced-motion: reduce) {
  .panic[data-phase="armed"] { animation: none; }
}
```

- [ ] **Step 5: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/components/PanicButton.test.tsx`
Expected: PASS (3 теста).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/PanicButton.tsx packages/web/src/components/PanicButton.module.css packages/web/test/components/PanicButton.test.tsx
git commit -m "feat(web): PanicButton — красная кнопка hold-to-send"
```

---

### Task 7: `ReportHero` (кнопка-герой + спокойный путь)

**Files:**
- Create: `packages/web/src/components/ReportHero.tsx`
- Create: `packages/web/src/components/ReportHero.module.css`
- Test: `packages/web/test/components/ReportHero.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../src/components/PanicButton", () => ({
  PanicButton: () => <button data-testid="panic-button">СООБЩИТЬ</button>,
}));

import { ReportHero } from "../../src/components/ReportHero";

afterEach(cleanup);

describe("ReportHero", () => {
  test("показывает кнопку и спокойную ссылку на /new", () => {
    render(<ReportHero />);
    expect(screen.getByTestId("panic-button")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /сообщить о другом/i });
    expect(link).toHaveAttribute("href", "/new");
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/components/ReportHero.test.tsx`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `ReportHero.tsx`**

```tsx
import { Link } from "../router/router";
import { PanicButton } from "./PanicButton";
import styles from "./ReportHero.module.css";

export function ReportHero() {
  return (
    <div className={styles.hero}>
      <PanicButton />
      <p className={styles.hint}>нажмите и держите при опасности</p>
      <Link className={styles.calm} to="/new">
        Сообщить о другом →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Реализовать `ReportHero.module.css`**

```css
.hero {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 14px 16px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.hint {
  margin: 6px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
.calm {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 14px;
  min-height: 32px;
}
```

- [ ] **Step 5: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/components/ReportHero.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ReportHero.tsx packages/web/src/components/ReportHero.module.css packages/web/test/components/ReportHero.test.tsx
git commit -m "feat(web): ReportHero — герой + спокойный путь"
```

---

### Task 8: Экран «Мои» (MyIncidents)

**Files:**
- Create: `packages/web/src/screens/MyIncidents.tsx`
- Test: `packages/web/test/screens/MyIncidents.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { FeedItem } from "../../src/feed/merge";

const h = vi.hoisted(() => ({ user: { id: "me" } as { id: string } | null, capturedFilter: null as null | ((it: FeedItem) => boolean) }));
vi.mock("../../src/auth/AuthProvider", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("../../src/screens/Feed", () => ({
  Feed: ({ filter }: { filter?: (it: FeedItem) => boolean }) => {
    h.capturedFilter = filter ?? null;
    return <div data-testid="feed" />;
  },
}));

import { MyIncidents } from "../../src/screens/MyIncidents";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const item = (over: Partial<FeedItem>): FeedItem => ({
  id: "x", authorId: null, level: "attention", status: "delivered",
  visibility: null, text: null, createdAt: "", pending: false, ...over,
});

describe("MyIncidents", () => {
  test("фильтр пропускает мои и pending, режет чужие", () => {
    render(<MyIncidents />);
    const f = h.capturedFilter!;
    expect(f(item({ authorId: "me" }))).toBe(true);
    expect(f(item({ authorId: "other" }))).toBe(false);
    expect(f(item({ authorId: null, pending: true }))).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/screens/MyIncidents.test.tsx`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `MyIncidents.tsx`**

```tsx
import { useAuth } from "../auth/AuthProvider";
import { Feed } from "./Feed";
import type { FeedItem } from "../feed/merge";

export function MyIncidents() {
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const filter = (item: FeedItem) => item.pending || (myId !== null && item.authorId === myId);
  return <Feed filter={filter} />;
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/screens/MyIncidents.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/screens/MyIncidents.tsx packages/web/test/screens/MyIncidents.test.tsx
git commit -m "feat(web): экран «Мои» (фильтр Feed)"
```

---

### Task 9: Карта-обзор — `markers` в IncidentMap + экран MapScreen

**Files:**
- Modify: `packages/web/src/map/IncidentMap.tsx`
- Modify: `packages/web/src/feed/labels.ts`
- Create: `packages/web/src/screens/MapScreen.tsx`
- Create: `packages/web/src/screens/MapScreen.module.css`
- Test: `packages/web/test/map/IncidentMap.test.tsx` (дополнить)
- Test: `packages/web/test/screens/MapScreen.test.tsx`

- [ ] **Step 1: Добавить `LEVEL_COLOR` в `labels.ts`**

```ts
export const LEVEL_COLOR: Record<IncidentLevel, string> = {
  emergency: "#ff3b3b",
  offence: "#ffb020",
  attention: "#3d8bff",
};
```
(добавить к существующим экспортам; `IncidentLevel` уже импортирован как тип.)

- [ ] **Step 2: Дописать падающий тест в `test/map/IncidentMap.test.tsx`**

```ts
test("display c markers: создаёт маркер на каждый инцидент", () => {
  render(
    <IncidentMap
      mode="display"
      markers={[
        { id: "a", lat: 1, lng: 2, level: "emergency" },
        { id: "b", lat: 3, lng: 4, level: "attention" },
      ]}
    />,
  );
  // 1 центральный (value не задан → DEFAULT_CENTER) + 2 маркера инцидентов
  expect(h.MarkerCtor).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 3: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/map/IncidentMap.test.tsx`
Expected: FAIL (`markers` не поддерживается, MarkerCtor вызван 1 раз).

- [ ] **Step 4: Расширить `IncidentMap.tsx`** (добавить тип маркера, пропсы и эффект синхронизации; существующий mount-эффект и value-эффект не трогаем)

```tsx
import { useEffect, useRef } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { IncidentLevel } from "@village/shared";
import { LEVEL_COLOR } from "../feed/labels";
import { config } from "../config";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface IncidentMarker {
  id: string;
  lat: number;
  lng: number;
  level: IncidentLevel;
}

interface Props {
  mode: "pick" | "display";
  value?: LatLng | null;
  onChange?: (coords: LatLng) => void;
  zoom?: number;
  markers?: IncidentMarker[];
  onMarkerClick?: (id: string) => void;
}

const DEFAULT_CENTER: LatLng = { lat: 55.0, lng: 37.0 };

function buildStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [config.mapTileUrl],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

function dot(color: string): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.setAttribute("aria-label", "Инцидент на карте");
  el.style.cssText = `width:18px;height:18px;border-radius:999px;border:2px solid #0b1220;background:${color};cursor:pointer;padding:0;`;
  return el;
}

export function IncidentMap({ mode, value, onChange, zoom = 14, markers, onMarkerClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const overlay = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!container.current) return;
    const center = value ?? DEFAULT_CENTER;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildStyle(),
      center: [center.lng, center.lat],
      zoom,
    });
    mapRef.current = map;
    const marker = new maplibregl.Marker({ draggable: mode === "pick" })
      .setLngLat([center.lng, center.lat])
      .addTo(map);
    markerRef.current = marker;

    if (mode === "pick") {
      const emit = (lngLat: { lng: number; lat: number }) =>
        onChange?.({ lat: lngLat.lat, lng: lngLat.lng });
      marker.on("dragend", () => emit(marker.getLngLat()));
      map.on("click", (e) => {
        marker.setLngLat(e.lngLat);
        emit(e.lngLat);
      });
    }

    return () => {
      for (const m of overlay.current) m.remove();
      overlay.current = [];
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // mount-once: режим/колбэк фиксируются при создании карты
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (value && markerRef.current) markerRef.current.setLngLat([value.lng, value.lat]);
  }, [value]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markers) return;
    for (const m of overlay.current) m.remove();
    overlay.current = markers.map((mk) => {
      const el = dot(LEVEL_COLOR[mk.level]);
      el.addEventListener("click", () => onMarkerClick?.(mk.id));
      return new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(map);
    });
  }, [markers, onMarkerClick]);

  return (
    <div
      ref={container}
      data-testid="incident-map"
      role="application"
      aria-label="Карта"
      style={{ height: "100%", minHeight: 240, width: "100%" }}
    />
  );
}

export default IncidentMap;
```

- [ ] **Step 5: Запустить тесты карты — PASS (старые + новый)**

Run: `pnpm -C packages/web exec vitest run test/map/IncidentMap.test.tsx`
Expected: PASS (включая pick/display/unmount/markers).

- [ ] **Step 6: Падающий тест MapScreen `test/screens/MapScreen.test.tsx`**

```tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Incident } from "@village/shared";
import type { IncidentMarker } from "../../src/map/IncidentMap";

const h = vi.hoisted(() => ({ listIncidents: vi.fn(), captured: null as null | IncidentMarker[] }));
vi.mock("../../src/api/endpoints", () => ({ listIncidents: h.listIncidents }));
vi.mock("../../src/map/IncidentMap", () => ({
  IncidentMap: ({ markers }: { markers?: IncidentMarker[] }) => {
    h.captured = markers ?? null;
    return <div data-testid="incident-map" />;
  },
}));

import { MapScreen } from "../../src/screens/MapScreen";

const withGeo: Incident = {
  id: "11111111-1111-4111-8111-111111111111",
  authorId: "a", level: "emergency", status: "delivered", visibility: "public",
  closeReason: null, text: null,
  geo: { lat: 55.7, lng: 37.6, accuracyM: 5, capturedAt: "2026-06-13T10:00:00.000Z" },
  createdAtClient: "2026-06-13T10:00:00.000Z", deliveredAtServer: null, acceptedAt: null, closedAt: null,
};
const noGeo: Incident = { ...withGeo, id: "22222222-2222-4222-8222-222222222222", geo: null };

beforeEach(() => { window.history.pushState(null, "", "/map"); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("MapScreen", () => {
  test("маркеры только из инцидентов с гео", async () => {
    h.listIncidents.mockResolvedValue([withGeo, noGeo]);
    render(<MapScreen />);
    await waitFor(() => expect(h.captured).not.toBeNull());
    expect(h.captured).toHaveLength(1);
    expect(h.captured![0]).toMatchObject({ id: withGeo.id, lat: 55.7, lng: 37.6, level: "emergency" });
  });
});
```

- [ ] **Step 7: Реализовать `MapScreen.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { Incident } from "@village/shared";
import { listIncidents } from "../api/endpoints";
import { IncidentMap, type IncidentMarker } from "../map/IncidentMap";
import { navigate } from "../router/router";
import styles from "./MapScreen.module.css";

export function MapScreen() {
  const [markers, setMarkers] = useState<IncidentMarker[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const incidents = await listIncidents();
        if (cancelled) return;
        setMarkers(
          incidents
            .filter((i: Incident) => i.geo !== null)
            .map((i) => ({ id: i.id, lat: i.geo!.lat, lng: i.geo!.lng, level: i.level })),
        );
      } catch {
        if (!cancelled) setMarkers([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>Карта</h1>
      <div className={styles.map}>
        <IncidentMap mode="display" markers={markers} onMarkerClick={(id) => navigate(`/i/${id}`)} />
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Реализовать `MapScreen.module.css`**

```css
.wrap { display: flex; flex-direction: column; height: 100%; }
.title { margin: 0; padding: 12px 16px; font-size: 16px; }
.map { flex: 1; min-height: 320px; }
```

- [ ] **Step 9: Запустить тесты — PASS**

Run: `pnpm -C packages/web exec vitest run test/map/IncidentMap.test.tsx test/screens/MapScreen.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/web/src/map/IncidentMap.tsx packages/web/src/feed/labels.ts packages/web/src/screens/MapScreen.tsx packages/web/src/screens/MapScreen.module.css packages/web/test/map/IncidentMap.test.tsx packages/web/test/screens/MapScreen.test.tsx
git commit -m "feat(web): карта-обзор — markers в IncidentMap + экран Карта"
```

---

### Task 10: Экран «Ещё» (More)

**Files:**
- Create: `packages/web/src/screens/More.tsx`
- Create: `packages/web/src/screens/More.module.css`
- Test: `packages/web/test/screens/More.test.tsx`

- [ ] **Step 1: Падающий тест**

```tsx
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("../../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Иван", role: "commander" }, signOut: h.signOut }),
}));
vi.mock("../../src/components/InstallPrompt", () => ({
  InstallPrompt: () => <div data-testid="install-prompt" />,
}));

import { More } from "../../src/screens/More";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("More", () => {
  test("показывает роль, InstallPrompt и зовёт signOut", () => {
    render(<More />);
    expect(screen.getByText(/командир/i)).toBeInTheDocument();
    expect(screen.getByTestId("install-prompt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));
    expect(h.signOut).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/screens/More.test.tsx`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `More.tsx`**

```tsx
import type { Role } from "@village/shared";
import { useAuth } from "../auth/AuthProvider";
import { InstallPrompt } from "../components/InstallPrompt";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import styles from "./More.module.css";

const ROLE_LABEL: Record<Role, string> = {
  commander: "Командир",
  resident: "Житель",
};

export function More() {
  const { user, signOut } = useAuth();
  const online = useOnlineStatus();

  return (
    <section className={styles.wrap}>
      <h1 className={styles.title}>Ещё</h1>
      <div className={styles.row}>
        <span className={styles.key}>Роль</span>
        <span>{user ? ROLE_LABEL[user.role] : "—"}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.key}>Сеть</span>
        <span>{online ? "онлайн" : "офлайн"}</span>
      </div>
      <InstallPrompt />
      <button type="button" className={styles.signout} onClick={() => void signOut()}>
        Выйти
      </button>
    </section>
  );
}
```
> Если в `@village/shared` роли отличаются от `commander`/`resident` — привести `ROLE_LABEL` к актуальному enum `Role` (см. `packages/shared/src/user.ts`); ключи должны покрыть все варианты enum, иначе упадёт типизация.

- [ ] **Step 4: Реализовать `More.module.css`**

```css
.wrap { padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.title { margin: 0 0 4px; font-size: 16px; }
.row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px; background: var(--surface); border-radius: var(--radius);
}
.key { color: var(--muted); }
.signout {
  min-height: var(--tap); margin-top: 8px;
  background: var(--surface); color: var(--emergency);
  border: 1px solid var(--border); border-radius: var(--radius); font-weight: 700;
}
```

- [ ] **Step 5: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/screens/More.test.tsx`
Expected: PASS.
> Если упало на `ROLE_LABEL` из-за иного enum `Role` — поправить ключи и метку в тесте (`/командир/i`) под актуальные роли.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/screens/More.tsx packages/web/src/screens/More.module.css packages/web/test/screens/More.test.tsx
git commit -m "feat(web): экран «Ещё» — роль, сеть, установка, выход"
```

---

### Task 11: Header + TabBar

**Files:**
- Create: `packages/web/src/components/Header.tsx` + `.module.css`
- Create: `packages/web/src/components/TabBar.tsx` + `.module.css`
- Test: `packages/web/test/components/TabBar.test.tsx`

- [ ] **Step 1: Падающий тест TabBar**

```tsx
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TabBar } from "../../src/components/TabBar";

beforeEach(() => { window.history.pushState(null, "", "/map"); });
afterEach(cleanup);

describe("TabBar", () => {
  test("4 вкладки, активная помечена aria-current", () => {
    render(<TabBar />);
    expect(screen.getByRole("link", { name: /лента/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /карта/i })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: /мои/i })).toHaveAttribute("href", "/mine");
    expect(screen.getByRole("link", { name: /ещё/i })).toHaveAttribute("href", "/more");
    expect(screen.getByRole("link", { name: /карта/i })).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/components/TabBar.test.tsx`
Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `TabBar.tsx`**

```tsx
import { Link, useLocation } from "../router/router";
import styles from "./TabBar.module.css";

const TABS = [
  { to: "/", label: "Лента", icon: "▤" },
  { to: "/map", label: "Карта", icon: "◍" },
  { to: "/mine", label: "Мои", icon: "◷" },
  { to: "/more", label: "Ещё", icon: "☰" },
] as const;

export function TabBar() {
  const path = useLocation();
  return (
    <nav className={styles.tabs} aria-label="Навигация">
      {TABS.map((t) => {
        const active = path === t.to;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={styles.tab}
            data-active={active}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.icon} aria-hidden="true">{t.icon}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Реализовать `TabBar.module.css`**

```css
.tabs {
  display: flex;
  background: #0e1726;
  border-top: 1px solid var(--border);
  padding-bottom: env(safe-area-inset-bottom);
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: var(--tap);
  padding: 8px 0 10px;
  font-size: 11px;
  color: var(--muted);
}
.tab[data-active="true"] { color: var(--text); }
.icon { font-size: 18px; line-height: 1.1; }
```

- [ ] **Step 5: Реализовать `Header.tsx`**

```tsx
import { config } from "../config";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import styles from "./Header.module.css";

export function Header() {
  const online = useOnlineStatus();
  return (
    <header className={styles.header}>
      <span className={styles.village}>{config.villageName}</span>
      <span className={styles.net} data-online={online} data-testid="net-status">
        <span className={styles.dot} />
        {online ? "онлайн" : "офлайн"}
      </span>
    </header>
  );
}
```

- [ ] **Step 6: Реализовать `Header.module.css`**

```css
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.village { font-size: 18px; font-weight: 800; letter-spacing: 0.02em; }
.net { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); }
.net[data-online="true"] { color: var(--online); }
.net[data-online="false"] { color: var(--offline); }
.dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
```

- [ ] **Step 7: Запустить — PASS**

Run: `pnpm -C packages/web exec vitest run test/components/TabBar.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/components/Header.tsx packages/web/src/components/Header.module.css packages/web/src/components/TabBar.tsx packages/web/src/components/TabBar.module.css packages/web/test/components/TabBar.test.tsx
git commit -m "feat(web): Header (сеть) и нижний TabBar"
```

---

### Task 12: AppShell — сборка навигации, новые роуты, герой в Ленте/Карте

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/App` styles → Create `packages/web/src/components/AppShell.module.css`
- Modify: `packages/web/src/routes.tsx`
- Modify: `packages/web/src/screens/Feed.tsx` (вставить ReportHero)
- Test: `packages/web/test/routes.test.tsx` (дополнить)

- [ ] **Step 1: Дописать падающие тесты в `test/routes.test.tsx`**

```ts
test("с токеном видны вкладки навигации", async () => {
  await setTokens({ accessToken: "a", refreshToken: "r" });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Лента" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /карта/i })).toHaveAttribute("href", "/map");
  expect(screen.getByRole("link", { name: /ещё/i })).toHaveAttribute("href", "/more");
});

test("на /register таб-бар скрыт", async () => {
  window.history.pushState(null, "", "/register");
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Регистрация" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /карта/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm -C packages/web exec vitest run test/routes.test.tsx`
Expected: FAIL (нет таб-бара).

- [ ] **Step 3: Добавить кейсы в `routes.tsx`** (импорты + ветки switch)

```tsx
import { MapScreen } from "./screens/MapScreen";
import { MyIncidents } from "./screens/MyIncidents";
import { More } from "./screens/More";
// ... внутри switch (route.name):
    case "map":
      return <MapScreen />;
    case "mine":
      return <MyIncidents />;
    case "more":
      return <More />;
```
(существующие кейсы и логика гейтинга не меняются.)

- [ ] **Step 4: Переписать `App.tsx` под AppShell**

```tsx
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { drainOutbox } from "./db/sync";
import { isPublicRoute, matchRoute } from "./router/match";
import { useLocation } from "./router/router";
import { Routes } from "./routes";
import styles from "./components/AppShell.module.css";

function Shell() {
  const { status } = useAuth();
  const path = useLocation();
  const chrome = status === "authed" && !isPublicRoute(matchRoute(path));

  useEffect(() => {
    if (status !== "authed") return;
    void drainOutbox();
    const onOnline = () => void drainOutbox();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status]);

  return (
    <div className={styles.shell}>
      {chrome && <Header />}
      <main className={styles.main}>
        <Routes />
      </main>
      {chrome && <TabBar />}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
```
> Примечание: `InstallPrompt` теперь живёт на экране «Ещё» (Task 10), из shell убран намеренно.

- [ ] **Step 5: Создать `AppShell.module.css`**

```css
.shell { display: flex; flex-direction: column; height: 100%; max-width: var(--maxw); margin: 0 auto; }
.main { flex: 1; overflow-y: auto; }
```

- [ ] **Step 6: Вставить `ReportHero` в `Feed.tsx`** (герой над лентой; заголовок «Лента» и data-testid сохраняем)

```tsx
import { ReportHero } from "../components/ReportHero";
// ... в return, оборачиваем содержимое:
  return (
    <>
      <ReportHero />
      <section>
        <h1>Лента</h1>
        {visible.length === 0 ? (
          <p>Пока нет инцидентов.</p>
        ) : (
          <ul>
            {visible.map((item) => (
              <li key={item.id}>
                <IncidentCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
```
> `ReportHero` рендерит `PanicButton`, который дёргает `enqueue`/`drainOutbox`/`captureGeo`. Существующий `test/feed/Feed.test.tsx` не мокает эти модули — добавить в начало файла моки, чтобы герой не лез в реальный IDB/гео:
> ```ts
> vi.mock("../../src/components/ReportHero", () => ({ ReportHero: () => <div data-testid="report-hero" /> }));
> ```
> (Feed-тесты проверяют ленту, а не герой — мок изолирует.)

- [ ] **Step 7: Запустить затронутые тесты — PASS**

Run: `pnpm -C packages/web exec vitest run test/routes.test.tsx test/feed/Feed.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/AppShell.module.css packages/web/src/routes.tsx packages/web/src/screens/Feed.tsx packages/web/test/routes.test.tsx packages/web/test/feed/Feed.test.tsx
git commit -m "feat(web): AppShell с навигацией, новые роуты, герой в ленте"
```

---

### Task 13: Рестайл IncidentCard и ленты (пустое состояние/скелетон)

**Files:**
- Modify: `packages/web/src/components/IncidentCard.tsx`
- Create: `packages/web/src/components/IncidentCard.module.css`
- Modify: `packages/web/src/screens/Feed.tsx`
- Create: `packages/web/src/screens/Feed.module.css`

> Чисто визуальная задача. **Сохранить все `data-testid` и тексты** (`level-badge`, `status-badge`, `visibility-badge`). Тесты не должны падать.

- [ ] **Step 1: `IncidentCard.module.css`**

```css
.link { display: block; }
.card {
  background: var(--surface);
  border-left: 4px solid var(--muted);
  border-radius: var(--radius);
  padding: 12px 13px;
}
.card[data-level="emergency"] { border-left-color: var(--emergency); }
.card[data-level="offence"] { border-left-color: var(--offence); }
.card[data-level="attention"] { border-left-color: var(--attention); }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.badge { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 999px; }
.card[data-level="emergency"] .badge { background: var(--emergency); color: #fff; }
.card[data-level="offence"] .badge { background: var(--offence); color: #1a1206; }
.card[data-level="attention"] .badge { background: var(--attention); color: #fff; }
.status { margin-left: auto; font-size: 10px; color: var(--muted); }
.text { margin: 0; font-size: 14px; line-height: 1.35; }
```

- [ ] **Step 2: Применить классы в `IncidentCard.tsx`** (структура и testid без изменений)

```tsx
import type { FeedItem } from "../feed/merge";
import { LEVEL_LABEL, STATUS_LABEL, VISIBILITY_LABEL } from "../feed/labels";
import { Link } from "../router/router";
import styles from "./IncidentCard.module.css";

export function IncidentCard({ item }: { item: FeedItem }) {
  const body = (
    <article className={styles.card} data-level={item.level} data-status={item.status}>
      <header className={styles.head}>
        <span className={styles.badge} data-testid="level-badge">{LEVEL_LABEL[item.level]}</span>
        <span className={styles.status} data-testid="status-badge">
          {item.pending ? "⏳ " : ""}
          {STATUS_LABEL[item.status]}
        </span>
        {item.visibility && (
          <span data-testid="visibility-badge">{VISIBILITY_LABEL[item.visibility]}</span>
        )}
      </header>
      {item.text && <p className={styles.text}>{item.text}</p>}
    </article>
  );

  if (item.pending) return body;
  return <Link className={styles.link} to={`/i/${item.id}`}>{body}</Link>;
}
```

- [ ] **Step 3: `Feed.module.css` + применить** (список, пустое состояние, скелетон; заголовок «Лента» сохранить)

```css
.title { margin: 0; padding: 12px 16px 8px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; }
.empty { padding: 32px 16px; text-align: center; color: var(--muted); }
.skeleton { height: 64px; margin: 0 16px 10px; border-radius: var(--radius); background: var(--surface); animation: shimmer 1.2s infinite; }
@keyframes shimmer { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

В `Feed.tsx` заменить «голые» состояния на стилизованные (классы + дружелюбный текст), сохранив тексты-маркеры для тестов:
```tsx
import styles from "./Feed.module.css";
// loading:
if (!items) {
  return (
    <>
      <ReportHero />
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
    </>
  );
}
// ...
      <section>
        <h1 className={styles.title}>Лента</h1>
        {visible.length === 0 ? (
          <p className={styles.empty}>Пока нет инцидентов.</p>
        ) : (
          <ul className={styles.list}>
            {visible.map((item) => (
              <li key={item.id}>
                <IncidentCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
```
> Тесты Feed ждут текст «Загрузка…» при `items===null`? Нет — текущие тесты ждут появления карточек/«Пока нет инцидентов.», а не «Загрузка…». Скелетон это не ломает. Текст «Пока нет инцидентов.» и заголовок «Лента» оставить дословно.

- [ ] **Step 4: Запустить тесты ленты/карточки и весь web**

Run: `pnpm -C packages/web test`
Expected: PASS (все, включая Feed/IncidentCard через существующие селекторы).

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/IncidentCard.tsx packages/web/src/components/IncidentCard.module.css packages/web/src/screens/Feed.tsx packages/web/src/screens/Feed.module.css
git commit -m "feat(web): рестайл карточки и ленты, скелетон/пустое состояние"
```

---

### Task 14: Рестайл остальных экранов (Create, Detail, Auth, NotFound)

**Files:**
- Modify: `packages/web/src/screens/CreateIncident.tsx` + Create `CreateIncident.module.css`
- Modify: `packages/web/src/screens/IncidentDetail.tsx` + Create `IncidentDetail.module.css`
- Modify: `packages/web/src/screens/Register.tsx`, `AuthCallback.tsx`, `NotFound.tsx` + Create `auth.module.css`

> Чисто визуальная задача. **Не менять тексты кнопок/заголовки и `data-testid`** (`photo-input`, `photo-preview`, `geo-indicator`, роль `alert`, заголовок «Регистрация», кнопка «Отправить» и т.д.) — на них завязаны тесты.

- [ ] **Step 1: `CreateIncident.module.css` (база)**

```css
.wrap { padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 14px; }
.title { margin: 0; font-size: 18px; }
.levels { display: flex; gap: 8px; border: none; padding: 0; margin: 0; }
.levels label {
  flex: 1; min-height: var(--tap); display: flex; align-items: center; justify-content: center;
  gap: 6px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
}
.text {
  width: 100%; min-height: 96px; padding: 12px; font: inherit;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius);
}
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { min-height: var(--tap); padding: 0 18px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.submit { min-height: var(--tap); background: var(--emergency); color: #fff; border: none; border-radius: var(--radius-lg); font-weight: 800; }
.error { color: var(--emergency); }
```

- [ ] **Step 2: Применить классы в `CreateIncident.tsx`** — навесить `className` на существующие элементы (section→`wrap`, h1→`title`, fieldset→`levels`, textarea→`text`, контейнеры кнопок→`actions`, кнопки→`btn`, финальная кнопка «Отправить»→`submit`, `<p role="alert">`→`error`). Разметку, обработчики, `data-testid` и тексты НЕ менять. Добавить в шапку ссылку «назад»:

```tsx
import { Link } from "../router/router";
import styles from "./CreateIncident.module.css";
// в начале return, перед/в section:
  <Link to="/" className={styles.btn} aria-label="Назад">← Назад</Link>
```

- [ ] **Step 3: `IncidentDetail.module.css` + применить** — стилизовать контейнер, отступы, секции (Timeline/медиа/комментарии/действия командира). Тексты и `data-testid` (если есть в Detail) сохранить. Базовый модуль:

```css
.wrap { padding: 12px 16px 24px; display: flex; flex-direction: column; gap: 16px; }
.back { min-height: 40px; display: inline-flex; align-items: center; }
.section { background: var(--surface); border-radius: var(--radius); padding: 12px; }
```
Навесить `wrap` на корневой контейнер, `back` на ссылку «назад» (если её нет — добавить `<Link to="/">← Назад</Link>`), `section` на блоки.

- [ ] **Step 4: `auth.module.css` + применить к Register/AuthCallback/NotFound** — центрированная карточка, крупные поля/кнопки. Заголовок «Регистрация» в `Register.tsx` оставить дословно (на него завязан `routes.test`).

```css
.wrap { min-height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px; padding: 24px; text-align: center; }
.card { width: 100%; max-width: 360px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; }
.cta { display: inline-flex; align-items: center; justify-content: center; min-height: var(--tap); padding: 0 20px; background: var(--attention); color: #fff; border-radius: var(--radius); font-weight: 700; }
```
Навесить `wrap`/`card`/`cta` на существующую разметку этих трёх экранов, не меняя тексты и логику.

- [ ] **Step 5: Запустить весь web + типы**

Run: `pnpm -C packages/web typecheck && pnpm -C packages/web test`
Expected: PASS (CreateIncident/IncidentDetail/AuthCallback/routes тесты зелёные — селекторы и тексты не тронуты).

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/screens/CreateIncident.tsx packages/web/src/screens/CreateIncident.module.css packages/web/src/screens/IncidentDetail.tsx packages/web/src/screens/IncidentDetail.module.css packages/web/src/screens/Register.tsx packages/web/src/screens/AuthCallback.tsx packages/web/src/screens/NotFound.tsx packages/web/src/screens/auth.module.css
git commit -m "feat(web): рестайл экранов создания, инцидента, входа и 404"
```

---

### Task 15: E2E (Playwright) + финальная проверка

**Files:**
- Modify/Create: `packages/web/e2e/` (существующие спеки Playwright — см. `playwright.config`)

> Цель: закрыть функциональную дыру и проверить новые потоки. Сверься со структурой существующих спеков (Task 20 фронтенда) и переиспользуй их фикстуры/seed-роуты.

- [ ] **Step 1: Найти существующие E2E и их хелперы**

Run: `ls packages/web/e2e 2>/dev/null; cat packages/web/playwright.config.* 2>/dev/null | head -40`
Expected: список спеков и конфиг (webServer, baseURL, seed через `/__test__/*`).

- [ ] **Step 2: Добавить спек навигации и достижимости `/new`**

В новом файле `packages/web/e2e/navigation.spec.ts` (по образцу существующих, с тем же login-хелпером):
```ts
import { test, expect } from "@playwright/test";
// использовать существующий хелпер логина из соседних спеков (magic-link / seed nonce)

test("таб-бар ведёт по вкладкам, /new достижим из UI", async ({ page }) => {
  // login как resident (переиспользовать helper)
  await page.goto("/");
  await expect(page.getByRole("link", { name: /карта/i })).toBeVisible();

  await page.getByRole("link", { name: /карта/i }).click();
  await expect(page).toHaveURL(/\/map$/);

  await page.goto("/");
  await page.getByRole("link", { name: /сообщить о другом/i }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("heading", { name: "Новый инцидент" })).toBeVisible();
});
```

- [ ] **Step 3: Добавить спек паники (hold-to-send)**

```ts
test("красная кнопка: удержание отправляет тревогу", async ({ page }) => {
  // login как resident
  await page.goto("/");
  const btn = page.getByTestId("panic-button");
  await btn.dispatchEvent("pointerdown");
  await page.waitForTimeout(1700); // > HOLD_MS
  await expect(btn).toContainText(/отпустите/i);
  await btn.dispatchEvent("pointerup");
  await expect(btn).toContainText(/отправлен/i);
});
```
> Если в реальном браузере геолокация блокирует — выдать разрешение через контекст (`context.grantPermissions(["geolocation"])`, `context.setGeolocation(...)`) в фикстуре.

- [ ] **Step 4: Прогнать E2E**

Run: `pnpm -C packages/web exec playwright test`
Expected: PASS (новые + существующие спеки). Требуется Docker (testcontainers) — конечный прогон, не watch.

- [ ] **Step 5: Финальная проверка всего проекта**

Run: `pnpm -C packages/web typecheck && pnpm -r test`
Expected: типы чистые; всё зелёное (shared 4 + web 101+новые + server 65).

Run: `pnpm -C packages/web build`
Expected: сборка PWA проходит (SW/манифест собираются).

- [ ] **Step 6: Commit**

```bash
git add packages/web/e2e
git commit -m "test(web): E2E — навигация, достижимость /new, путь паники"
```

---

## Self-Review

**1. Покрытие спека:**
- Дизайн-токены/тема → Task 1. ✓
- Без CSS-фреймворков → CSS Modules, зафиксировано в Architecture. ✓
- Таб-бар Лента/Карта/Мои/Ещё → Tasks 5, 8, 9, 10, 11, 12. ✓
- Кнопка-герой sticky + hold-to-send + вибро → Tasks 6, 7; sticky в ReportHero.module.css; герой в Ленте (Task 12) и Карте — **проверка:** в спеке герой и на Карте. В плане ReportHero вставлен в Feed (Task 12), а MapScreen (Task 9) героя не содержит. **Расхождение со спеком.** → см. правку ниже.
- Паника = emergency с авто-гео, без формы → Task 6. ✓
- Спокойный путь /new достижим → Task 7 (ссылка) + Task 15 (E2E). ✓
- Карта пинами → Task 9. ✓
- «Мои» фильтром → Tasks 2, 3, 8. ✓
- «Ещё» (роль/сеть/установка/выход) → Task 10. ✓
- Индикатор сети → Tasks 4, 11. ✓
- Сохранение data-testid/тестов → отмечено в Tasks 13, 14. ✓
- Юниты PanicButton + фильтр «Мои» → Tasks 6, 8. ✓
- E2E паника/спокойный/табы/`/new` → Task 15. ✓

**2. Плейсхолдеры:** нет «TBD/TODO»; в задачах рестайла (13, 14) код-стэпы содержат реальный CSS и точечные правки className — это не плейсхолдеры, а механические правки с явным запретом трогать testid/тексты.

**3. Согласованность типов:** `FeedItem.authorId` (Task 2) используется в фильтре «Мои» (Task 8); `IncidentMarker` (Task 9) экспортируется из IncidentMap и используется в MapScreen и его тесте; `useOnlineStatus` (Task 4) — в Header и More; `Route` варианты (Task 5) — в routes.tsx (Task 12) и App shell. Имена совпадают.

**ПРАВКА по итогам self-review (герой на Карте):** в **Task 9, Step 7** добавить герой над картой, чтобы соответствовать спеку (герой на Ленте и Карте). Изменить начало `return` в `MapScreen.tsx`:
```tsx
import { ReportHero } from "../components/ReportHero";
// ...
  return (
    <section className={styles.wrap}>
      <ReportHero />
      <h1 className={styles.title}>Карта</h1>
      <div className={styles.map}>
        <IncidentMap mode="display" markers={markers} onMarkerClick={(id) => navigate(`/i/${id}`)} />
      </div>
    </section>
  );
```
И в `MapScreen.test.tsx` (Task 9, Step 6) добавить мок героя, чтобы не тянуть IDB/гео:
```ts
vi.mock("../../src/components/ReportHero", () => ({ ReportHero: () => <div data-testid="report-hero" /> }));
```
Файлы для `git add` в Task 9, Step 10 уже включают MapScreen и его тест — дополнительных путей не требуется.
