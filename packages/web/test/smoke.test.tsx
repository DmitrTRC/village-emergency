import { render, screen } from "@testing-library/react";
import { App } from "../src/App";

test("рендерит заголовок приложения", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: /village-emrg/i })).toBeInTheDocument();
});
