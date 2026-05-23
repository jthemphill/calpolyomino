import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CalendarPuzzle } from "../CalendarPuzzle.js";
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
  type KissatSolver,
} from "../kissat-js/kissat-emscripten.ts";

type Month =
  | "Jan"
  | "Feb"
  | "Mar"
  | "Apr"
  | "May"
  | "Jun"
  | "Jul"
  | "Aug"
  | "Sep"
  | "Oct"
  | "Nov"
  | "Dec";

type Cell = [number, number];

type Solution = {
  pieceIdx: number;
  r: number;
  c: number;
  cells: Cell[];
};

type Placement = {
  pieceIdx: number;
  r: number;
  c: number;
  bits: bigint;
  cellsList: Cell[];
};

type Puzzle = {
  pieces: Cell[][];
  validCells: Set<string>;
  months: Record<Month, Cell>;
  days: Record<number, Cell>;
  cellToIndex: Map<string, number>;
  globalPlacements: Placement[][];
  solveBacktrack(month: Month, day: number): Solution[] | null;
};

type Options = {
  runs: number;
  jsonPath: string | null;
  help: boolean;
};

type Target = {
  forbiddenBits: bigint;
  targetBits: bigint;
};

type KissatResult = {
  solution: Solution[] | null;
  totalMs: number;
  solveMs: number;
  status: number;
  variableCount: number;
  clauseCount: number;
};

type DateBenchmark = {
  month: Month;
  day: number;
  solved: boolean;
  variableCount: number;
  clauseCount: number;
  backtrackMs: number[];
  kissatTotalMs: number[];
  kissatSolveMs: number[];
  backtrackMedianMs: number;
  kissatTotalMedianMs: number;
  kissatSolveMedianMs: number;
};

const MONTHS: Month[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function usage(): string {
  return [
    "Usage: bun run benchmark [--runs N] [--json[=out/path.json]]",
    "",
    "Options:",
    "  --runs N          Number of timed runs per month/day pair. Default: 3.",
    "  --json            Write JSON to out/solver-benchmark.json.",
    "  --json PATH       Write JSON to PATH.",
    "  --help            Show this message.",
  ].join("\n");
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    runs: 3,
    jsonPath: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--runs") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--runs requires a value");
      }
      options.runs = parseRuns(value);
      continue;
    }

    if (arg?.startsWith("--runs=")) {
      options.runs = parseRuns(arg.slice("--runs=".length));
      continue;
    }

    if (arg === "--json") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options.jsonPath = next;
        i++;
      } else {
        options.jsonPath = "out/solver-benchmark.json";
      }
      continue;
    }

    if (arg?.startsWith("--json=")) {
      const value = arg.slice("--json=".length);
      options.jsonPath = value || "out/solver-benchmark.json";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseRuns(value: string): number {
  const runs = Number(value);
  if (!Number.isInteger(runs) || runs < 1) {
    throw new Error(`Invalid --runs value: ${value}`);
  }
  return runs;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

function stats(values: number[]) {
  return {
    min: Math.min(...values),
    median: median(values),
    mean: mean(values),
    p95: percentile(values, 95),
    max: Math.max(...values),
    total: values.reduce((sum, value) => sum + value, 0),
  };
}

function formatMs(value: number): string {
  return value.toFixed(value < 10 ? 3 : 2);
}

function formatRatio(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${(numerator / denominator).toFixed(2)}x`;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function addClause(
  solver: KissatSolver,
  literals: number[]
): void {
  for (const literal of literals) {
    kissatAdd(solver, literal);
  }
  kissatAdd(solver, 0);
}

function addExactlyOne(
  solver: KissatSolver,
  variables: number[]
): number {
  let clauseCount = 0;
  addClause(solver, variables);
  clauseCount++;

  for (let i = 0; i < variables.length; i++) {
    const left = variables[i];
    if (left === undefined) continue;

    for (let j = i + 1; j < variables.length; j++) {
      const right = variables[j];
      if (right === undefined) continue;

      addClause(solver, [-left, -right]);
      clauseCount++;
    }
  }

  return clauseCount;
}

function getTarget(puzzle: Puzzle, month: Month, day: number): Target {
  const monthCell = puzzle.months[month];
  const dayCell = puzzle.days[day];

  if (!monthCell || !dayCell) {
    throw new Error(`Invalid month/day: ${month} ${day}`);
  }

  const forbiddenIdx1 = puzzle.cellToIndex.get(`${monthCell[0]},${monthCell[1]}`);
  const forbiddenIdx2 = puzzle.cellToIndex.get(`${dayCell[0]},${dayCell[1]}`);

  if (forbiddenIdx1 === undefined || forbiddenIdx2 === undefined) {
    throw new Error(`Invalid target indices for ${month} ${day}`);
  }

  const forbiddenBits =
    (1n << BigInt(forbiddenIdx1)) | (1n << BigInt(forbiddenIdx2));
  const targetBits =
    (1n << BigInt(puzzle.validCells.size)) - 1n - forbiddenBits;

  return { forbiddenBits, targetBits };
}

function buildKissatVariables(puzzle: Puzzle, target: Target) {
  const variableToPlacement: Placement[] = [];
  const variablesByPiece: number[][] = puzzle.globalPlacements.map(() => []);
  const variablesByCell: number[][] = Array.from(
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

function solveWithKissat(
  puzzle: Puzzle,
  month: Month,
  day: number
): KissatResult {
  const totalStart = performance.now();
  const solver = kissatInit();
  let solveMs = 0;
  let status = 0;
  let variableCount = 0;
  let clauseCount = 0;

  try {
    kissatSetQuiet(solver);

    const target = getTarget(puzzle, month, day);
    const { variableToPlacement, variablesByPiece, variablesByCell } =
      buildKissatVariables(puzzle, target);
    variableCount = variableToPlacement.length;

    for (const variables of variablesByPiece) {
      clauseCount += addExactlyOne(solver, variables);
    }

    for (let cellIndex = 0; cellIndex < puzzle.validCells.size; cellIndex++) {
      if ((target.targetBits & (1n << BigInt(cellIndex))) !== 0n) {
        clauseCount += addExactlyOne(
          solver,
          variablesByCell[cellIndex] ?? []
        );
      }
    }

    const solveStart = performance.now();
    status = kissatSolve(solver);
    solveMs = performance.now() - solveStart;

    if (status === KISSAT_UNSAT) {
      return {
        solution: null,
        totalMs: performance.now() - totalStart,
        solveMs,
        status,
        variableCount,
        clauseCount,
      };
    }

    if (status !== KISSAT_SAT) {
      throw new Error(`Kissat returned unexpected status ${status}`);
    }

    const solution: Solution[] = [];
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
      totalMs: performance.now() - totalStart,
      solveMs,
      status,
      variableCount,
      clauseCount,
    };
  } finally {
    kissatRelease(solver);
  }
}

function validateExactCover(
  puzzle: Puzzle,
  month: Month,
  day: number,
  solution: Solution[] | null,
  solverName: string
): boolean {
  if (solution === null) {
    return false;
  }

  const target = getTarget(puzzle, month, day);
  const seenPieces = new Set<number>();
  let coveredBits = 0n;

  for (const placement of solution) {
    if (seenPieces.has(placement.pieceIdx)) {
      throw new Error(
        `${solverName} reused piece ${placement.pieceIdx} for ${month} ${day}`
      );
    }
    seenPieces.add(placement.pieceIdx);

    let placementBits = 0n;
    for (const [row, col] of placement.cells) {
      const cellIndex = puzzle.cellToIndex.get(`${row},${col}`);
      if (cellIndex === undefined) {
        throw new Error(
          `${solverName} placed piece ${placement.pieceIdx} on invalid cell ${row},${col}`
        );
      }
      placementBits |= 1n << BigInt(cellIndex);
    }

    if ((placementBits & target.forbiddenBits) !== 0n) {
      throw new Error(
        `${solverName} covered a target cell for ${month} ${day}`
      );
    }

    if ((coveredBits & placementBits) !== 0n) {
      throw new Error(`${solverName} has overlapping cells for ${month} ${day}`);
    }

    coveredBits |= placementBits;
  }

  if (seenPieces.size !== puzzle.pieces.length) {
    throw new Error(
      `${solverName} used ${seenPieces.size} pieces instead of ${puzzle.pieces.length} for ${month} ${day}`
    );
  }

  if (coveredBits !== target.targetBits) {
    throw new Error(`${solverName} did not exactly cover ${month} ${day}`);
  }

  return true;
}

function timeBacktrack(puzzle: Puzzle, month: Month, day: number) {
  const start = performance.now();
  const solution = puzzle.solveBacktrack(month, day);
  return {
    solution,
    ms: performance.now() - start,
  };
}

function printDateTable(rows: DateBenchmark[]): void {
  console.log(
    [
      "Date",
      pad("Backtrack", 11),
      pad("Kissat total", 13),
      pad("Kissat solve", 13),
      pad("Total speed", 12),
      pad("Solve speed", 12),
      pad("Vars", 6),
      pad("Clauses", 8),
      "Result",
    ].join("  ")
  );
  console.log("-".repeat(104));

  for (const row of rows) {
    console.log(
      [
        `${row.month} ${String(row.day).padStart(2, "0")}`,
        pad(formatMs(row.backtrackMedianMs), 11),
        pad(formatMs(row.kissatTotalMedianMs), 13),
        pad(formatMs(row.kissatSolveMedianMs), 13),
        pad(formatRatio(row.backtrackMedianMs, row.kissatTotalMedianMs), 12),
        pad(formatRatio(row.backtrackMedianMs, row.kissatSolveMedianMs), 12),
        pad(row.variableCount, 6),
        pad(row.clauseCount, 8),
        row.solved ? "SAT" : "UNSAT",
      ].join("  ")
    );
  }
}

function printAggregate(
  label: string,
  values: number[],
  unit = "ms"
): void {
  const summary = stats(values);
  console.log(
    [
      pad(label, 13),
      pad(formatMs(summary.min), 10),
      pad(formatMs(summary.median), 10),
      pad(formatMs(summary.mean), 10),
      pad(formatMs(summary.p95), 10),
      pad(formatMs(summary.max), 10),
      pad(formatMs(summary.total), 12),
      unit,
    ].join("  ")
  );
}

function printSummary(rows: DateBenchmark[], runs: number): void {
  const solvedCount = rows.filter((row) => row.solved).length;
  const backtrackMedians = rows.map((row) => row.backtrackMedianMs);
  const kissatTotalMedians = rows.map((row) => row.kissatTotalMedianMs);
  const kissatSolveMedians = rows.map((row) => row.kissatSolveMedianMs);

  console.log("");
  console.log(`Dates benchmarked: ${rows.length}`);
  console.log(`Runs per date: ${runs}`);
  console.log(`Solved dates: ${solvedCount}/${rows.length}`);
  console.log("");
  console.log(
    [
      pad("Solver", 13),
      pad("Min", 10),
      pad("Median", 10),
      pad("Mean", 10),
      pad("P95", 10),
      pad("Max", 10),
      pad("Total", 12),
      "Unit",
    ].join("  ")
  );
  console.log("-".repeat(88));
  printAggregate("Backtrack", backtrackMedians);
  printAggregate("Kissat total", kissatTotalMedians);
  printAggregate("Kissat solve", kissatSolveMedians);

  const totalBacktrack = backtrackMedians.reduce((sum, ms) => sum + ms, 0);
  const totalKissat = kissatTotalMedians.reduce((sum, ms) => sum + ms, 0);
  const totalKissatSolve = kissatSolveMedians.reduce((sum, ms) => sum + ms, 0);

  console.log("");
  console.log(
    `Total speedup using Kissat total time: ${formatRatio(
      totalBacktrack,
      totalKissat
    )}`
  );
  console.log(
    `Total speedup using Kissat solve-only time: ${formatRatio(
      totalBacktrack,
      totalKissatSolve
    )}`
  );

  printSlowest("Slowest backtracking dates", rows, "backtrackMedianMs");
  printSlowest("Slowest Kissat total dates", rows, "kissatTotalMedianMs");
}

function printSlowest(
  title: string,
  rows: DateBenchmark[],
  key: "backtrackMedianMs" | "kissatTotalMedianMs"
): void {
  console.log("");
  console.log(`${title}:`);
  const slowest = rows
    .slice()
    .sort((a, b) => b[key] - a[key])
    .slice(0, 10);

  for (const row of slowest) {
    console.log(
      `  ${row.month} ${String(row.day).padStart(2, "0")}: ${formatMs(
        row[key]
      )} ms`
    );
  }
}

async function writeJsonReport(
  path: string,
  rows: DateBenchmark[],
  runs: number,
  elapsedMs: number
): Promise<void> {
  const report = {
    generatedAt: new Date().toISOString(),
    runsPerDate: runs,
    elapsedMs,
    dates: rows,
    aggregates: {
      backtrackMedianMs: stats(rows.map((row) => row.backtrackMedianMs)),
      kissatTotalMedianMs: stats(rows.map((row) => row.kissatTotalMedianMs)),
      kissatSolveMedianMs: stats(rows.map((row) => row.kissatSolveMedianMs)),
    },
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  const puzzle = new CalendarPuzzle() as Puzzle;
  await waitForKissatInitialized();
  const startedAt = performance.now();
  const rows: DateBenchmark[] = [];

  for (const month of MONTHS) {
    for (let day = 1; day <= 31; day++) {
      const backtrackMs: number[] = [];
      const kissatTotalMs: number[] = [];
      const kissatSolveMs: number[] = [];
      let solved = false;
      let variableCount = 0;
      let clauseCount = 0;

      for (let run = 0; run < options.runs; run++) {
        const backtrack = timeBacktrack(puzzle, month, day);
        const backtrackSolved = validateExactCover(
          puzzle,
          month,
          day,
          backtrack.solution,
          "Backtrack"
        );

        const kissatResult = solveWithKissat(puzzle, month, day);
        const kissatSolved = validateExactCover(
          puzzle,
          month,
          day,
          kissatResult.solution,
          "Kissat"
        );

        if (backtrackSolved !== kissatSolved) {
          throw new Error(
            `Solver mismatch for ${month} ${day}: backtrack=${backtrackSolved}, kissat=${kissatSolved}`
          );
        }

        solved = backtrackSolved;
        variableCount = kissatResult.variableCount;
        clauseCount = kissatResult.clauseCount;
        backtrackMs.push(backtrack.ms);
        kissatTotalMs.push(kissatResult.totalMs);
        kissatSolveMs.push(kissatResult.solveMs);
      }

      rows.push({
        month,
        day,
        solved,
        variableCount,
        clauseCount,
        backtrackMs,
        kissatTotalMs,
        kissatSolveMs,
        backtrackMedianMs: median(backtrackMs),
        kissatTotalMedianMs: median(kissatTotalMs),
        kissatSolveMedianMs: median(kissatSolveMs),
      });
    }
  }

  const elapsedMs = performance.now() - startedAt;
  printDateTable(rows);
  printSummary(rows, options.runs);
  console.log("");
  console.log(`Benchmark elapsed wall time: ${formatMs(elapsedMs)} ms`);

  if (options.jsonPath) {
    await writeJsonReport(options.jsonPath, rows, options.runs, elapsedMs);
    console.log(`JSON report written to ${options.jsonPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
