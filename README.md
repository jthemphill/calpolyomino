# Calendar Puzzle Solver

A browser-based solver for the daily calendar puzzle using JavaScript.

**[Try it live!](https://jthemphill.github.io/calpolyomino/)**

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

## Usage

Simply open `index.html` in your web browser!

The puzzle will automatically solve for today's date. You can select any month and day from the dropdowns and click "Solve Puzzle" to see the solution.

### Features

- Visual, color-coded solution display
- Interactive month and day selection
- Auto-solves for today's date on load
- Clean, modern UI with responsive design
- Works entirely in the browser (no server needed)

## How It Works

The solver uses a **backtracking search algorithm**:
- Generates all possible orientations (rotations and reflections) for each piece
- Enumerates all valid placements on the board
- Searches for a configuration where all non-target cells are covered exactly once

The algorithm is implemented in pure JavaScript and runs directly in your browser.

## Customizing Pieces

The default piece definitions may not match your physical puzzle. You can easily update them in `solver.js`!

### How to Define Your Pieces

1. Look at your physical puzzle pieces
2. Open `solver.js` and find the `pieceAscii` array (around line 71)
3. Update each piece definition using `#` to mark cells

### Example Piece Definitions

```javascript
const pieceAscii = [
    // Piece 0: 3x2 rectangle (6 cells)
    `
    ##
    ##
    ##
    `,

    // Piece 1: L pentomino (5 cells)
    `
    #
    #
    #
    ##
    `,

    // Add more pieces...
];
```

### Tips for Defining Pieces

- Use `#` for cells that are part of the piece
- Use spaces for empty cells
- Indentation and extra whitespace are automatically trimmed
- Make sure you have exactly 8 pieces
- Total cells should be 41 (1 hexomino of 6 cells + 7 pentominoes of 5 cells each)

## Output

The solver displays:
- A visual board with color-coded pieces
- Month and day labels
- Each piece marked with its number and unique color
- Target cells marked in black
- Success/error status messages

## Deployment

This project automatically deploys to GitHub Pages via GitHub Actions. Any push to the `main` branch will trigger a new deployment.

The live site is available at: https://jthemphill.github.io/calpolyomino/

### Setting up GitHub Pages

To enable GitHub Pages for this repository:
1. Go to repository Settings
2. Navigate to Pages (under Code and automation)
3. Set Source to "GitHub Actions"
4. The workflow will automatically deploy on the next push to `main`

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge
- Firefox
- Safari
- Opera

No installation or dependencies required!
