// @ts-check

import { CalendarPuzzle } from "./CalendarPuzzle.js";

/** @typedef {import("./CalendarPuzzle.js").Month} Month */

// Create puzzle instance
const puzzle = new CalendarPuzzle();

// Listen for messages from main thread
self.addEventListener("message", (/** @type {MessageEvent} */ e) => {
  const { month, day } = e.data;

  try {
    // Solve the puzzle
    const startTime = performance.now();
    const solution = puzzle.solveBacktrack(
      /** @type {Month} */ (month),
      Number(day)
    );
    const solveTimeMs = performance.now() - startTime;

    // Send result back to main thread
    self.postMessage({
      success: true,
      solution,
      month,
      day,
      solveTimeMs,
    });
  } catch (error) {
    // Send error back to main thread
    const errorMessage = error instanceof Error ? error.message : String(error);
    self.postMessage({
      success: false,
      error: errorMessage,
      month,
      day,
    });
  }
});
