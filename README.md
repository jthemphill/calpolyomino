# Calendar Puzzle Solver

A solver for the daily calendar puzzle using Python and Z3.

## The Puzzle

The calendar puzzle is a physical puzzle with:
- A board with cells for months (Jan-Dec) and days (1-31)
- 8 polyomino pieces (7 pentominoes of 5 cells each, and 1 hexomino of 6 cells)
- Goal: Place all pieces so that only the current month and day cells remain empty

### Board Layout
```
Jan Feb Mar Apr May Jun
Jul Aug Sep Oct Nov Dec
 1   2   3   4   5   6   7
 8   9  10  11  12  13  14
15  16  17  18  19  20  21
22  23  24  25  26  27  28
29  30  31
```

- Total valid cells: 43 (12 months + 31 days)
- Cells to fill: 41 (leaving 2 empty for target month and day)

## Installation

```bash
uv sync
```

## Usage

Run the solver with a specific month and day:

```bash
uv run solver.py <Month> <Day>
```

### Examples

```bash
# Solve for January 7
uv run solver.py Jan 7

# Solve for December 25
uv run solver.py Dec 25

# Solve for July 4
uv run solver.py Jul 4

# View the current piece definitions
uv run solver.py --show-pieces
```

If no arguments are provided, it defaults to January 7.

## How It Works

The solver uses two approaches:

1. **Backtracking Search** (default, faster): Tries to place pieces one by one, backtracking when it hits a dead end
2. **Z3 SMT Solver** (fallback): Uses constraint solving if backtracking fails

The solver:
- Generates all possible orientations (rotations and reflections) for each piece
- Enumerates all valid placements on the board
- Searches for a configuration where all non-target cells are covered exactly once

## Customizing Pieces

The default piece definitions may not match your physical puzzle. You can easily update them using ASCII art!

### How to Define Your Pieces

1. Look at your physical puzzle pieces
2. Open `solver.py` and find the `piece_ascii` list (around line 70)
3. Update each piece definition using `#` to mark cells

### Example Piece Definitions

```python
piece_ascii = [
    # Piece 0: 3x2 rectangle (6 cells)
    """
    ##
    ##
    ##
    """,

    # Piece 1: L pentomino (5 cells)
    """
    #
    #
    #
    ##
    """,

    # Add more pieces...
]
```

### Viewing Your Pieces

To see what the current pieces look like:

```bash
uv run solver.py --show-pieces
```

This displays all pieces in ASCII format with their cell counts, making it easy to verify they match your physical puzzle.

### Tips for Defining Pieces

- Use `#` for cells that are part of the piece
- Use spaces for empty cells
- Indentation and extra whitespace are automatically trimmed
- Make sure you have exactly 8 pieces
- Total cells should be 41 (1 hexomino of 6 cells + 7 pentominoes of 5 cells each)

## Output

The solver displays:
- A visual representation of the solution
- Month and day labels
- Each piece marked with a unique character (0-7)
- Target cells marked with █
- Invalid cells marked with ·

## Requirements

- Python 3.14+
- z3-solver 4.15.4.0
