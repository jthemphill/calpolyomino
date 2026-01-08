"""
Calendar Puzzle Solver using Z3

Board layout:
  Jan Feb Mar Apr May Jun
  Jul Aug Sep Oct Nov Dec
   1   2   3   4   5   6   7
   8   9  10  11  12  13  14
  15  16  17  18  19  20  21
  22  23  24  25  26  27  28
  29  30  31

8 pieces total:
- 7 pentominoes (5 cells each)
- 1 hexomino (3x2 rectangle)
Total: 41 cells to fill (43 valid cells - 2 empty for month/day)
"""

from z3 import *
from typing import List, Tuple, Set, Optional
import sys


class CalendarPuzzle:
    def __init__(self):
        # Board dimensions
        self.rows = 7
        self.cols = 7

        # Define valid cells
        self.valid_cells = set()

        # Row 0-1: Months (6 cells each)
        for row in range(2):
            for col in range(6):
                self.valid_cells.add((row, col))

        # Rows 2-5: Days (7 cells each)
        for row in range(2, 6):
            for col in range(7):
                self.valid_cells.add((row, col))

        # Row 6: Days 29-31 (3 cells)
        for col in range(3):
            self.valid_cells.add((6, col))

        # Month positions
        self.months = {
            'Jan': (0, 0), 'Feb': (0, 1), 'Mar': (0, 2),
            'Apr': (0, 3), 'May': (0, 4), 'Jun': (0, 5),
            'Jul': (1, 0), 'Aug': (1, 1), 'Sep': (1, 2),
            'Oct': (1, 3), 'Nov': (1, 4), 'Dec': (1, 5)
        }

        # Day positions
        self.days = {}
        day = 1
        for row in range(2, 6):
            for col in range(7):
                self.days[day] = (row, col)
                day += 1
        for col in range(3):
            self.days[day] = (6, col)
            day += 1

        # Define the 8 pieces using ASCII art
        # Use '#' to mark cells that are part of the piece
        # TODO: Update these to match your actual puzzle pieces!
        # Use `uv run solver.py --show-pieces` to verify
        piece_ascii = [
            # Piece 0: 3x2 rectangle (6 cells) - the only hexomino
            """
            ##
            ##
            ##
            """,

            # Piece 1: Tall L pentomino
            """
            #
            #
            #
            ##
            """,

            # Piece 2: P pentomino
            """
            ##
            ##
            #
            """,

            # Piece 3: S pentomino
            """
             ##
             #
            ##
            """,

            # Piece 4: Y pentomino
            """
             #
            ##
             #
             #
            """,

            # Piece 5: C pentomino
            """
            ##
            #
            ##
            """,

            # Piece 6: r pentomino
            """
            ###
            #
            #
            """,

            # Piece 7: N pentomino
            """
             #
             #
            ##
            #
            """,
        ]

        self.pieces = [self.parse_ascii_piece(p) for p in piece_ascii]

    def parse_ascii_piece(self, ascii_art: str) -> List[Tuple[int, int]]:
        """Parse an ASCII art piece definition into coordinates."""
        # Split into lines without stripping first (to preserve relative indentation)
        lines = ascii_art.split('\n')

        # Remove leading/trailing empty lines
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()

        if not lines:
            return []

        # Find minimum indentation across all non-empty lines
        non_empty_lines = [line for line in lines if line.strip()]
        if not non_empty_lines:
            return []
        min_indent = min(len(line) - len(line.lstrip()) for line in non_empty_lines)

        # Remove common indentation and trailing whitespace
        lines = [line[min_indent:].rstrip() if len(line) >= min_indent else line.rstrip()
                 for line in lines]

        coords = []
        for row, line in enumerate(lines):
            for col, char in enumerate(line):
                if char == '#':
                    coords.append((row, col))
        return coords

    def print_pieces(self):
        """Print all pieces in ASCII format for verification."""
        print("\nPuzzle Pieces:")
        print("=" * 50)
        for idx, piece in enumerate(self.pieces):
            if not piece:
                continue
            max_row = max(r for r, c in piece)
            max_col = max(c for r, c in piece)
            grid = [[' ' for _ in range(max_col + 1)] for _ in range(max_row + 1)]
            for r, c in piece:
                grid[r][c] = '#'
            print(f"\nPiece {idx} ({len(piece)} cells):")
            for row in grid:
                print("  " + "".join(row).rstrip())
        print("=" * 50)

    def normalize_piece(self, piece: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """Normalize piece to start at (0, 0)."""
        if not piece:
            return piece
        min_row = min(r for r, c in piece)
        min_col = min(c for r, c in piece)
        return sorted([(r - min_row, c - min_col) for r, c in piece])

    def rotate_90(self, piece: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """Rotate piece 90 degrees clockwise."""
        return [(c, -r) for r, c in piece]

    def flip_horizontal(self, piece: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """Flip piece horizontally."""
        return [(r, -c) for r, c in piece]

    def get_all_orientations(self, piece: List[Tuple[int, int]]) -> List[List[Tuple[int, int]]]:
        """Get all unique rotations and flips of a piece."""
        orientations = set()
        current = piece

        # Try all 4 rotations
        for _ in range(4):
            normalized = tuple(self.normalize_piece(current))
            orientations.add(normalized)

            # Also try flipped version
            flipped = self.flip_horizontal(current)
            normalized = tuple(self.normalize_piece(flipped))
            orientations.add(normalized)

            # Rotate for next iteration
            current = self.rotate_90(current)

        return [list(o) for o in orientations]

    def solve_backtrack(self, month: str, day: int) -> Optional[List[Tuple[int, int, int, List[Tuple[int, int]]]]]:
        """Solve using backtracking."""
        month_cell = self.months[month]
        day_cell = self.days[day]
        forbidden = {month_cell, day_cell}

        # Generate all valid placements for each piece
        all_placements = []
        for piece_idx, piece in enumerate(self.pieces):
            placements = []
            for orientation in self.get_all_orientations(piece):
                for r in range(self.rows):
                    for c in range(self.cols):
                        cells = [(r + dr, c + dc) for dr, dc in orientation]
                        if all(cell in self.valid_cells and cell not in forbidden for cell in cells):
                            placements.append((piece_idx, r, c, set(cells)))
            all_placements.append(placements)

        # Backtracking search
        covered = set()
        solution = []

        def backtrack(piece_idx: int) -> bool:
            if piece_idx == len(self.pieces):
                # Check if all cells are covered
                target = self.valid_cells - forbidden
                return covered == target

            for pidx, r, c, cells in all_placements[piece_idx]:
                if cells.isdisjoint(covered) and cells.isdisjoint(forbidden):
                    # Try placing this piece
                    covered.update(cells)
                    solution.append((pidx, r, c, sorted(list(cells))))

                    if backtrack(piece_idx + 1):
                        return True

                    # Backtrack
                    covered.difference_update(cells)
                    solution.pop()

            return False

        if backtrack(0):
            return solution
        return None

    def solve_z3(self, month: str, day: int, timeout_ms: int = 60000) -> Optional[List[Tuple[int, List[Tuple[int, int]]]]]:
        """Solve using Z3."""
        month_cell = self.months[month]
        day_cell = self.days[day]
        forbidden = {month_cell, day_cell}

        solver = Solver()
        solver.set("timeout", timeout_ms)

        # Generate all valid placements for each piece
        piece_placements = []
        for piece_idx, piece in enumerate(self.pieces):
            placements = []
            for orientation in self.get_all_orientations(piece):
                for r in range(self.rows):
                    for c in range(self.cols):
                        cells = [(r + dr, c + dc) for dr, dc in orientation]
                        if all(cell in self.valid_cells and cell not in forbidden for cell in cells):
                            placements.append(set(cells))
            piece_placements.append(placements)

        # Create boolean variables
        placement_vars = []
        for piece_idx, placements in enumerate(piece_placements):
            if not placements:
                # No valid placements for this piece
                return None
            vars_for_piece = [Bool(f'p{piece_idx}_{i}') for i in range(len(placements))]
            placement_vars.append(vars_for_piece)
            # Each piece used exactly once
            solver.add(PbEq([(v, 1) for v in vars_for_piece], 1))

        # Each cell covered exactly once
        cell_to_vars = {}
        for piece_idx, placements in enumerate(piece_placements):
            for placement_idx, cells in enumerate(placements):
                var = placement_vars[piece_idx][placement_idx]
                for cell in cells:
                    if cell not in cell_to_vars:
                        cell_to_vars[cell] = []
                    cell_to_vars[cell].append(var)

        for cell in self.valid_cells - forbidden:
            if cell in cell_to_vars:
                solver.add(PbEq([(v, 1) for v in cell_to_vars[cell]], 1))

        # Solve
        if solver.check() == sat:
            model = solver.model()
            solution = []
            for piece_idx, vars_for_piece in enumerate(placement_vars):
                for placement_idx, var in enumerate(vars_for_piece):
                    if model.evaluate(var):
                        cells = list(piece_placements[piece_idx][placement_idx])
                        solution.append((piece_idx, sorted(cells)))
                        break
            return solution
        return None

    def visualize(self, month: str, day: int, solution: List):
        """Visualize the solution."""
        if not solution:
            print(f"✗ No solution found for {month} {day}")
            return

        board = [[' ' for _ in range(self.cols)] for _ in range(self.rows)]

        # Mark invalid cells
        for r in range(self.rows):
            for c in range(self.cols):
                if (r, c) not in self.valid_cells:
                    board[r][c] = '·'

        # Mark target cells
        month_cell = self.months[month]
        day_cell = self.days[day]
        board[month_cell[0]][month_cell[1]] = '█'
        board[day_cell[0]][day_cell[1]] = '█'

        # Place pieces
        chars = '0123456789ABCDEFGHIJ'
        for piece_idx, *rest in solution:
            cells = rest[-1] if len(rest) > 1 else rest[0]
            char = chars[piece_idx]
            for r, c in cells:
                board[r][c] = char

        # Print
        print(f"\n{'='*50}")
        print(f"Solution for {month} {day}:")
        print('='*50)

        months = [['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                  ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']]

        for row_idx in range(2):
            print("  " + "  ".join(f"{m:3}" for m in months[row_idx]))
            print("  " + "  ".join(board[row_idx][:6]))

        print()
        day_num = 1
        for row_idx in range(2, 7):
            if row_idx < 6:
                days = [f"{day_num+i:2}" for i in range(7)]
                print("  " + "  ".join(days))
                print("  " + "  ".join(board[row_idx]))
                day_num += 7
            else:
                days = [f"{day_num+i:2}" for i in range(3)]
                print("  " + "  ".join(days) + "  " + "·"*12)
                print("  " + "  ".join(board[row_idx][:3]) + "  " + "·"*12)

        print('='*50)
        print(f"\nPiece sizes: {[len(p) for p in self.pieces]}")
        print(f"Total cells covered: {sum(len(cells) for _, *r in solution for cells in [r[-1] if len(r) > 1 else r[0]])}")


def main():
    puzzle = CalendarPuzzle()

    # Get month and day from command line or use default
    if len(sys.argv) >= 3:
        month = sys.argv[1]
        day = int(sys.argv[2])
    else:
        # Default to January 7
        month = 'Jan'
        day = 7

    print(f"Calendar Puzzle Solver")

    # Print pieces if --show-pieces flag is used
    if '--show-pieces' in sys.argv:
        puzzle.print_pieces()
        return

    print(f"Solving for {month} {day}...\n")
    print("Attempting backtracking search...")

    solution = puzzle.solve_backtrack(month, day)

    if solution:
        print("✓ Solution found with backtracking!")
        puzzle.visualize(month, day, solution)
    else:
        print("Backtracking didn't find a solution.")
        print("Trying Z3 solver (may take longer)...")
        solution = puzzle.solve_z3(month, day)
        if solution:
            print("✓ Solution found with Z3!")
            puzzle.visualize(month, day, solution)
        else:
            print("\n✗ No solution found.")
            print("The piece definitions may not match your actual puzzle pieces.")
            print("You can update the 'pieces' list in the code with the actual shapes.")


if __name__ == "__main__":
    main()
