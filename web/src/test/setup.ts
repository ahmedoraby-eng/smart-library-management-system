import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom has no layout: stub what the UI calls (pure-logic test files run in node and skip this).
if (typeof window !== "undefined") {
  window.requestAnimationFrame ??= (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;
  window.scrollTo = () => undefined; // router scroll restoration
}
