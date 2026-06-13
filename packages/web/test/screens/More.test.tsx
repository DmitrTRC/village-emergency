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
