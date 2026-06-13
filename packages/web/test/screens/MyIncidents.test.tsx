import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
