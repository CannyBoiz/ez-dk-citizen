// Runs after every test in every file: unmount, undo spies, and drop anything stored locally.
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
