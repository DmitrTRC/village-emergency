import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/App";
import { clear, setTokens } from "../src/auth/session";
import { resetDbForTests } from "../src/db/idb";

beforeEach(async () => {
  window.history.pushState(null, "", "/");
  await resetDbForTests();
  await clear();
});

afterEach(cleanup);

describe("гейтинг роутов", () => {
  test("без токена приватный роут отдаёт регистрацию", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Регистрация" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/register"));
  });

  test("с токеном приватный роут отдаёт ленту", async () => {
    await setTokens({ accessToken: "a", refreshToken: "r" });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Лента" })).toBeInTheDocument();
  });

  test("публичный /register доступен без токена", async () => {
    window.history.pushState(null, "", "/register");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Регистрация" })).toBeInTheDocument();
  });

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
});
