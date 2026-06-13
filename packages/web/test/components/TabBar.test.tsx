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
