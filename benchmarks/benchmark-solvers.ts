import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CalendarPuzzle } from "../CalendarPuzzle.js";
import {
  solveKissatSync,
  waitForKissatInitialized,
} from "../CalendarPuzzleKissat.js";

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
  all: boolean;
  dates: BenchmarkDate[] | null;
  help: boolean;
};

type BenchmarkDate = {
  month: Month;
  day: number;
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
  auxiliaryVariableCount: number;
  totalVariableCount: number;
  clauseCount: number;
};

type DateBenchmark = {
  month: Month;
  day: number;
  solved: boolean;
  variableCount: number;
  auxiliaryVariableCount: number;
  totalVariableCount: number;
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

const DEFAULT_BENCHMARK_DATES: BenchmarkDate[] = [
  // Slowest backtracking dates from the full 372-date run.
  { month: "Feb", day: 15 },
  { month: "Dec", day: 5 },
  { month: "Jul", day: 8 },
  { month: "May", day: 3 },
  { month: "Feb", day: 4 },
  { month: "Feb", day: 11 },
  { month: "Jan", day: 29 },
  { month: "Jul", day: 6 },
  { month: "Mar", day: 1 },
  { month: "Mar", day: 2 },
  // Slowest Kissat total dates from the full 372-date run.
  { month: "Oct", day: 11 },
  { month: "Feb", day: 28 },
  { month: "Feb", day: 24 },
  { month: "Oct", day: 17 },
  { month: "Jun", day: 24 },
  { month: "Sep", day: 2 },
  { month: "Jun", day: 4 },
  { month: "Oct", day: 26 },
  { month: "Nov", day: 31 },
];

const MONTH_BY_NAME = new Map<string, Month>(
  MONTHS.map((month) => [month.toLowerCase(), month])
);

function usage(): string {
  return [
    "Usage: bun run benchmark [--runs N] [--all] [--dates LIST] [--json[=out/path.json]]",
    "",
    "By default this benchmarks 19 representative slow dates.",
    "",
    "Options:",
    "  --runs N          Number of timed runs per month/day pair. Default: 3.",
    "  --all             Benchmark all 372 month/day pairs.",
    "  --dates LIST      Benchmark comma-separated dates, e.g. \"Feb-15,Oct-11\".",
    "  --json            Write JSON to out/solver-benchmark.json.",
    "  --json PATH       Write JSON to PATH.",
    "  --help            Show this message.",
  ].join("\n");
}

function parseOptions(argv: string[]): Options {
  const options: Options = {
    runs: 3,
    jsonPath: null,
    all: false,
    dates: null,
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

    if (arg === "--all") {
      options.all = true;
      continue;
    }

    if (arg === "--dates") {
      const value = argv[++i];
      if (!value) {
        throw new Error("--dates requires a comma-separated date list");
      }
      options.dates = parseDateList(value);
      continue;
    }

    if (arg?.startsWith("--dates=")) {
      const value = arg.slice("--dates=".length);
      if (!value) {
        throw new Error("--dates requires a comma-separated date list");
      }
      options.dates = parseDateList(value);
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

  if (options.all && options.dates) {
    throw new Error("--all and --dates cannot be used together");
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

function parseDateList(value: string): BenchmarkDate[] {
  const dates = value
    .split(",")
    .map((date) => date.trim())
    .filter((date) => date.length > 0)
    .map(parseBenchmarkDate);

  if (dates.length === 0) {
    throw new Error("--dates requires at least one date");
  }

  return deduplicateDates(dates);
}

function parseBenchmarkDate(value: string): BenchmarkDate {
  const match = value.match(/^([A-Za-z]{3})\s*[-:/]?\s*(\d{1,2})$/);
  if (!match) {
    throw new Error(`Invalid benchmark date: ${value}`);
  }

  const monthName = match[1];
  const dayValue = match[2];
  if (!monthName || !dayValue) {
    throw new Error(`Invalid benchmark date: ${value}`);
  }

  const month = MONTH_BY_NAME.get(monthName.toLowerCase());
  const day = Number(dayValue);

  if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Invalid benchmark date: ${value}`);
  }

  return { month, day };
}

function deduplicateDates(dates: BenchmarkDate[]): BenchmarkDate[] {
  const seen = new Set<string>();
  const uniqueDates: BenchmarkDate[] = [];

  for (const date of dates) {
    const key = getDateKey(date);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    uniqueDates.push(date);
  }

  return uniqueDates;
}

function getDateKey(date: BenchmarkDate): string {
  return `${date.month}-${date.day}`;
}

function getAllBenchmarkDates(): BenchmarkDate[] {
  return MONTHS.flatMap((month) =>
    Array.from({ length: 31 }, (_, dayIndex) => ({
      month,
      day: dayIndex + 1,
    }))
  );
}

function getBenchmarkDates(options: Options): {
  label: string;
  dates: BenchmarkDate[];
} {
  if (options.all) {
    return { label: "all", dates: getAllBenchmarkDates() };
  }

  if (options.dates) {
    return { label: "custom", dates: options.dates };
  }

  return { label: "slow-sample", dates: DEFAULT_BENCHMARK_DATES };
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

function solveWithKissat(
  puzzle: Puzzle,
  month: Month,
  day: number
): KissatResult {
  const totalStart = performance.now();
  const result = solveKissatSync(puzzle, month, day);

  return {
    solution: result.solution,
    totalMs: performance.now() - totalStart,
    solveMs: result.solveOnlyMs,
    status: result.status,
    variableCount: result.variableCount,
    auxiliaryVariableCount: result.auxiliaryVariableCount,
    totalVariableCount: result.totalVariableCount,
    clauseCount: result.clauseCount,
  };
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
      pad("Aux", 6),
      pad("Total vars", 10),
      pad("Clauses", 8),
      "Result",
    ].join("  ")
  );
  console.log("-".repeat(124));

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
        pad(row.auxiliaryVariableCount, 6),
        pad(row.totalVariableCount, 10),
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

function printSummary(
  rows: DateBenchmark[],
  runs: number,
  dateSetLabel: string
): void {
  const solvedCount = rows.filter((row) => row.solved).length;
  const backtrackMedians = rows.map((row) => row.backtrackMedianMs);
  const kissatTotalMedians = rows.map((row) => row.kissatTotalMedianMs);
  const kissatSolveMedians = rows.map((row) => row.kissatSolveMedianMs);

  console.log("");
  console.log(`Date set: ${dateSetLabel}`);
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
  dateSetLabel: string,
  elapsedMs: number
): Promise<void> {
  const report = {
    generatedAt: new Date().toISOString(),
    runsPerDate: runs,
    dateSet: dateSetLabel,
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

  const dateSelection = getBenchmarkDates(options);
  const puzzle = new CalendarPuzzle() as Puzzle;
  await waitForKissatInitialized();
  const startedAt = performance.now();
  const rows: DateBenchmark[] = [];

  for (const { month, day } of dateSelection.dates) {
    const backtrackMs: number[] = [];
    const kissatTotalMs: number[] = [];
    const kissatSolveMs: number[] = [];
    let solved = false;
    let variableCount = 0;
    let auxiliaryVariableCount = 0;
    let totalVariableCount = 0;
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
      auxiliaryVariableCount = kissatResult.auxiliaryVariableCount;
      totalVariableCount = kissatResult.totalVariableCount;
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
      auxiliaryVariableCount,
      totalVariableCount,
      clauseCount,
      backtrackMs,
      kissatTotalMs,
      kissatSolveMs,
      backtrackMedianMs: median(backtrackMs),
      kissatTotalMedianMs: median(kissatTotalMs),
      kissatSolveMedianMs: median(kissatSolveMs),
    });
  }

  const elapsedMs = performance.now() - startedAt;
  printDateTable(rows);
  printSummary(rows, options.runs, dateSelection.label);
  console.log("");
  console.log(`Benchmark elapsed wall time: ${formatMs(elapsedMs)} ms`);

  if (options.jsonPath) {
    await writeJsonReport(
      options.jsonPath,
      rows,
      options.runs,
      dateSelection.label,
      elapsedMs
    );
    console.log(`JSON report written to ${options.jsonPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
