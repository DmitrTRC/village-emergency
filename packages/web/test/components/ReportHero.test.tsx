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
