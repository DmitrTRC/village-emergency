import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { SseEvent } from "@village/shared";
import { parseSseData, useEventStream, type SseTransport } from "../../src/sse/useEventStream";

const ACCEPTED: SseEvent = {
  type: "incident.accepted",
  id: "11111111-1111-4111-8111-111111111111",
};

function fakeTransport() {
  const opens: Array<{ onMessage: (d: string) => void; onError: () => void }> = [];
  const closes: number[] = [];
  const transport: SseTransport = {
    open(h) {
      opens.push(h);
      return () => closes.push(opens.length - 1);
    },
  };
  return { transport, opens, closes };
}

describe("parseSseData", () => {
  test("валидный JSON-event → объект", () => {
    expect(parseSseData(JSON.stringify(ACCEPTED))).toEqual(ACCEPTED);
  });

  test("битый payload → null", () => {
    expect(parseSseData("не json")).toBeNull();
    expect(parseSseData(JSON.stringify({ type: "bogus", id: "x" }))).toBeNull();
    expect(parseSseData(JSON.stringify({ type: "incident.accepted" }))).toBeNull();
  });
});

describe("useEventStream", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("валидное событие → вызывает обработчик с распарсенным event", () => {
    const { transport, opens } = fakeTransport();
    const onEvent = vi.fn();
    renderHook(() => useEventStream(onEvent, transport));

    expect(opens).toHaveLength(1);
    act(() => opens[0]!.onMessage(JSON.stringify(ACCEPTED)));
    expect(onEvent).toHaveBeenCalledWith(ACCEPTED);
  });

  test("битый payload игнорируется", () => {
    const { transport, opens } = fakeTransport();
    const onEvent = vi.fn();
    renderHook(() => useEventStream(onEvent, transport));

    act(() => opens[0]!.onMessage("{ broken"));
    expect(onEvent).not.toHaveBeenCalled();
  });

  test("reconnect после ошибки с backoff", () => {
    const { transport, opens } = fakeTransport();
    renderHook(() => useEventStream(vi.fn(), transport));

    expect(opens).toHaveLength(1);
    act(() => opens[0]!.onError());
    expect(opens).toHaveLength(1);

    act(() => vi.advanceTimersByTime(1000));
    expect(opens).toHaveLength(2);
  });

  test("успешное сообщение сбрасывает backoff", () => {
    const { transport, opens } = fakeTransport();
    renderHook(() => useEventStream(vi.fn(), transport));

    act(() => opens[0]!.onMessage(JSON.stringify(ACCEPTED)));
    act(() => opens[0]!.onError());
    act(() => vi.advanceTimersByTime(1000));
    expect(opens).toHaveLength(2);
  });

  test("unmount закрывает поток и не реконнектит", () => {
    const { transport, opens, closes } = fakeTransport();
    const { unmount } = renderHook(() => useEventStream(vi.fn(), transport));

    unmount();
    expect(closes).toHaveLength(1);
    act(() => vi.advanceTimersByTime(60000));
    expect(opens).toHaveLength(1);
  });
});
