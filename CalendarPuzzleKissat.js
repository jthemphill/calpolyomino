// @ts-check

import {
  KISSAT_SAT,
  KISSAT_UNSAT,
  kissatAdd,
  kissatInit,
  kissatRelease,
  kissatSetQuiet,
  kissatSolve,
  kissatValue,
  waitForKissatInitialized,
} from "./kissat-js/kissat-emscripten.js";

/** @typedef {import("./CalendarPuzzle.js").Month} Month */
/** @typedef {import("./CalendarPuzzle.js").Cell} Cell */
/** @typedef {import("./CalendarPuzzle.js").Solution} Solution */
/** @typedef {import("./CalendarPuzzle.js").Placement} Placement */

/**
 * @typedef {{
 *   pieces: Cell[][],
 *   validCells: Set<string>,
 *   months: Record<Month, Cell>,
 *   days: Record<number, Cell>,
 *   cellToIndex: Map<string, number>,
 *   globalPlacements: Placement[][],
 * }} KissatPuzzle
 */

/**
 * @typedef {{
 *   forbiddenBits: bigint,
 *   targetBits: bigint,
 * }} Target
 */

/**
 * @typedef {{
 *   solution: Solution[] | null,
 *   solveOnlyMs: number,
 *   status: number,
 *   variableCount: number,
 *   auxiliaryVariableCount: number,
 *   totalVariableCount: number,
 *   clauseCount: number,
 * }} KissatSolveResult
 */

/**
 * @typedef {{
 *   nextVariable: number,
 *   auxiliaryVariableCount: number,
 * }} VariableAllocator
 */

/**
 * @param {number} solver
 * @param {number[]} literals
 */
function addClause(solver, literals) {
  for (const literal of literals) {
    kissatAdd(solver, literal);
  }
  kissatAdd(solver, 0);
}

/**
 * @param {number} solver
 * @param {number[]} variables
 * @param {VariableAllocator} allocator
 * @returns {number}
 */
function addExactlyOne(solver, variables, allocator) {
  let clauseCount = 0;
  addClause(solver, variables);
  clauseCount++;

  if (variables.length <= 1) {
    return clauseCount;
  }

  /** @type {number[]} */
  const sequentialVariables = [];
  for (let i = 0; i < variables.length - 1; i++) {
    sequentialVariables.push(allocateAuxiliaryVariable(allocator));
  }

  addClause(solver, [
    -getVariableAt(variables, 0),
    getVariableAt(sequentialVariables, 0),
  ]);
  clauseCount++;

  for (let i = 1; i < variables.length - 1; i++) {
    const variable = getVariableAt(variables, i);
    const previousSequential = getVariableAt(sequentialVariables, i - 1);
    const sequential = getVariableAt(sequentialVariables, i);

    addClause(solver, [-variable, sequential]);
    addClause(solver, [-previousSequential, sequential]);
    addClause(solver, [-variable, -previousSequential]);
    clauseCount += 3;
  }

  addClause(solver, [
    -getVariableAt(variables, variables.length - 1),
    -getVariableAt(sequentialVariables, sequentialVariables.length - 1),
  ]);
  clauseCount++;

  return clauseCount;
}

/**
 * @param {VariableAllocator} allocator
 * @returns {number}
 */
function allocateAuxiliaryVariable(allocator) {
  const variable = allocator.nextVariable;
  allocator.nextVariable++;
  allocator.auxiliaryVariableCount++;
  return variable;
}

/**
 * @param {number[]} variables
 * @param {number} index
 * @returns {number}
 */
function getVariableAt(variables, index) {
  const variable = variables[index];
  if (variable === undefined) {
    throw new Error(`Missing SAT variable at index ${index}`);
  }
  return variable;
}

/**
 * @param {KissatPuzzle} puzzle
 * @param {Month} month
 * @param {number} day
 * @returns {Target}
 */
function getTarget(puzzle, month, day) {
  const monthCell = puzzle.months[month];
  const dayCell = puzzle.days[day];

  if (!monthCell || !dayCell) {
    throw new Error(`Invalid month or day: ${month}, ${day}`);
  }

  const forbiddenIdx1 = puzzle.cellToIndex.get(
    `${monthCell[0]},${monthCell[1]}`
  );
  const forbiddenIdx2 = puzzle.cellToIndex.get(`${dayCell[0]},${dayCell[1]}`);

  if (forbiddenIdx1 === undefined || forbiddenIdx2 === undefined) {
    throw new Error(`Invalid cell indices for month or day`);
  }

  const forbiddenBits =
    (1n << BigInt(forbiddenIdx1)) | (1n << BigInt(forbiddenIdx2));
  const targetBits =
    (1n << BigInt(puzzle.validCells.size)) - 1n - forbiddenBits;

  return { forbiddenBits, targetBits };
}

/**
 * @param {KissatPuzzle} puzzle
 * @param {Target} target
 */
function buildKissatVariables(puzzle, target) {
  /** @type {Placement[]} */
  const variableToPlacement = [];
  /** @type {number[][]} */
  const variablesByPiece = puzzle.globalPlacements.map(() => []);
  /** @type {number[][]} */
  const variablesByCell = Array.from(
    { length: puzzle.validCells.size },
    () => []
  );

  for (const placements of puzzle.globalPlacements) {
    for (const placement of placements) {
      if ((placement.bits & target.forbiddenBits) !== 0n) {
        continue;
      }

      const variable = variableToPlacement.length + 1;
      variableToPlacement.push(placement);
      variablesByPiece[placement.pieceIdx]?.push(variable);

      for (const [row, col] of placement.cellsList) {
        const cellIndex = puzzle.cellToIndex.get(`${row},${col}`);
        if (cellIndex === undefined) {
          throw new Error(`Placement uses invalid cell ${row},${col}`);
        }
        variablesByCell[cellIndex]?.push(variable);
      }
    }
  }

  return { variableToPlacement, variablesByPiece, variablesByCell };
}

/**
 * @param {KissatPuzzle} puzzle
 * @param {Month} month
 * @param {number} day
 * @returns {KissatSolveResult}
 */
function solveKissatSync(puzzle, month, day) {
  const solver = kissatInit();
  let solveOnlyMs = 0;
  let status = 0;
  let variableCount = 0;
  let auxiliaryVariableCount = 0;
  let clauseCount = 0;

  try {
    kissatSetQuiet(solver);

    console.time("build")
    const target = getTarget(puzzle, month, day);
    const { variableToPlacement, variablesByPiece, variablesByCell } =
      buildKissatVariables(puzzle, target);
    variableCount = variableToPlacement.length;
    /** @type {VariableAllocator} */
    const allocator = {
      nextVariable: variableCount + 1,
      auxiliaryVariableCount: 0,
    };

    for (const variables of variablesByPiece) {
      clauseCount += addExactlyOne(solver, variables, allocator);
    }

    for (let cellIndex = 0; cellIndex < puzzle.validCells.size; cellIndex++) {
      if ((target.targetBits & (1n << BigInt(cellIndex))) !== 0n) {
        clauseCount += addExactlyOne(
          solver,
          variablesByCell[cellIndex] ?? [],
          allocator
        );
      }
    }
    auxiliaryVariableCount = allocator.auxiliaryVariableCount;
    console.timeEnd("build");

    console.time("solve");
    const solveStart = performance.now();
    status = kissatSolve(solver);
    solveOnlyMs = performance.now() - solveStart;
    console.timeEnd("solve");

    if (status === KISSAT_UNSAT) {
      return {
        solution: null,
        solveOnlyMs,
        status,
        variableCount,
        auxiliaryVariableCount,
        totalVariableCount: variableCount + auxiliaryVariableCount,
        clauseCount,
      };
    }

    if (status !== KISSAT_SAT) {
      throw new Error(`Kissat returned unexpected status ${status}`);
    }

    /** @type {Solution[]} */
    const solution = [];
    for (let variable = 1; variable <= variableToPlacement.length; variable++) {
      if (kissatValue(solver, variable) <= 0) {
        continue;
      }

      const placement = variableToPlacement[variable - 1];
      if (!placement) {
        throw new Error(`Missing placement for variable ${variable}`);
      }

      solution.push({
        pieceIdx: placement.pieceIdx,
        r: placement.r,
        c: placement.c,
        cells: placement.cellsList
          .slice()
          .sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])),
      });
    }

    return {
      solution,
      solveOnlyMs,
      status,
      variableCount,
      auxiliaryVariableCount,
      totalVariableCount: variableCount + auxiliaryVariableCount,
      clauseCount,
    };
  } finally {
    kissatRelease(solver);
  }
}

/**
 * @param {KissatPuzzle} puzzle
 * @param {Month} month
 * @param {number} day
 * @returns {Promise<KissatSolveResult>}
 */
async function solveKissat(puzzle, month, day) {
  await waitForKissatInitialized();
  return solveKissatSync(puzzle, month, day);
}

export { solveKissat, solveKissatSync, waitForKissatInitialized };
