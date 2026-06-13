import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  exchangeToken: vi.fn(),
  setSession: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("../../src/api/endpoints", () => ({ exchangeToken: h.exchangeToken }));
vi.mock("../../src/auth/AuthProvider", () => ({ useAuth: () => ({ setSession: h.setSession }) }));
vi.mock("../../src/router/router", async (orig) => ({
  ...(await orig<typeof import("../../src/router/router")>()),
  navigate: h.navigate,
}));

import { AuthCallback } from "../../src/screens/AuthCallback";

function goTo(search: string) {
  window.history.replaceState(null, "", `/auth/callback${search}`);
}

beforeEach(() => {
  h.setSession.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthCallback", () => {
  test("валидный token → exchange, setSession, переход к ленте", async () => {
    goTo("?token=nonce-123");
    h.exchangeToken.mockResolvedValue({
      accessToken: "acc",
      refreshToken: "ref",
      user: { id: "11111111-1111-4111-8111-111111111111", name: "Житель", role: "resident" },
    });

    render(<AuthCallback />);

    await waitFor(() => expect(h.exchangeToken).toHaveBeenCalledWith("nonce-123"));
    expect(h.setSession).toHaveBeenCalledWith(
      { accessToken: "acc", refreshToken: "ref" },
      { id: "11111111-1111-4111-8111-111111111111", name: "Житель", role: "resident" },
    );
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/"));
  });

  test("нет token → ошибка входа, exchange не вызван", async () => {
    goTo("");

    render(<AuthCallback />);

    expect(await screen.findByText("Не удалось войти")).toBeInTheDocument();
    expect(h.exchangeToken).not.toHaveBeenCalled();
  });

  test("ошибка обмена → ошибка входа, перехода нет", async () => {
    goTo("?token=bad");
    h.exchangeToken.mockRejectedValue(new Error("401"));

    render(<AuthCallback />);

    expect(await screen.findByText("Не удалось войти")).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
