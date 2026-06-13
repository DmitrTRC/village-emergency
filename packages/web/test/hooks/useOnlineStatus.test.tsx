import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useOnlineStatus } from "../../src/hooks/useOnlineStatus";

afterEach(cleanup);

function Probe() {
  return <span>{useOnlineStatus() ? "online" : "offline"}</span>;
}

describe("useOnlineStatus", () => {
  test("реагирует на события online/offline", () => {
    let online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    render(<Probe />);
    expect(screen.getByText("online")).toBeInTheDocument();

    act(() => { online = false; window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText("offline")).toBeInTheDocument();

    act(() => { online = true; window.dispatchEvent(new Event("online")); });
    expect(screen.getByText("online")).toBeInTheDocument();
  });
});
