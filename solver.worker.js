// @ts-check

import { CalendarPuzzle } from "./CalendarPuzzle.js";
import {
  solveKissat,
  waitForKissatInitialized,
} from "./CalendarPuzzleKissat.js";

/** @typedef {import("./CalendarPuzzle.js").Month} Month */

// Create puzzle instance
const puzzle = new CalendarPuzzle();
const kissatReady = waitForKissatInitialized();

// Listen for messages from main thread
self.addEventListener("message", async (/** @type {MessageEvent} */ e) => {
  const { month, day } = e.data;

  try {
    // Solve the puzzle
    await kissatReady;
    const startTime = performance.now();
    const kissatResult = await solveKissat(
      /** @type {import("./CalendarPuzzleKissat.js").KissatPuzzle} */ (puzzle),
      /** @type {Month} */ (month),
      Number(day)
    );
    const solveTimeMs = performance.now() - startTime;

    // Send result back to main thread
    self.postMessage({
      success: true,
      solution: kissatResult.solution,
      month,
      day,
      solveTimeMs,
      solveOnlyMs: kissatResult.solveOnlyMs,
      solver: "kissat",
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
