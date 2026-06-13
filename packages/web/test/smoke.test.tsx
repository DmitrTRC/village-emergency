import { render, screen } from "@testing-library/react";
import { App } from "../src/App";

test("App монтируется и отдаёт main-landmark", () => {
  render(<App />);
  expect(screen.getByRole("main")).toBeInTheDocument();
});
