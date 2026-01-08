/**
 * Calendar Puzzle Solver
 *
 * Board layout:
 *   Jan Feb Mar Apr May Jun
 *   Jul Aug Sep Oct Nov Dec
 *    1   2   3   4   5   6   7
 *    8   9  10  11  12  13  14
 *   15  16  17  18  19  20  21
 *   22  23  24  25  26  27  28
 *   29  30  31
 *
 * 8 pieces total:
 * - 7 pentominoes (5 cells each)
 * - 1 hexomino (3x2 rectangle)
 * Total: 41 cells to fill (43 valid cells - 2 empty for month/day)
 */

class CalendarPuzzle {
    constructor() {
        // Board dimensions
        this.rows = 7;
        this.cols = 7;

        // Define valid cells
        this.validCells = new Set();

        // Row 0-1: Months (6 cells each)
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 6; col++) {
                this.validCells.add(`${row},${col}`);
            }
        }

        // Rows 2-5: Days (7 cells each)
        for (let row = 2; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                this.validCells.add(`${row},${col}`);
            }
        }

        // Row 6: Days 29-31 (3 cells)
        for (let col = 0; col < 3; col++) {
            this.validCells.add(`6,${col}`);
        }

        // Month positions
        this.months = {
            'Jan': [0, 0], 'Feb': [0, 1], 'Mar': [0, 2],
            'Apr': [0, 3], 'May': [0, 4], 'Jun': [0, 5],
            'Jul': [1, 0], 'Aug': [1, 1], 'Sep': [1, 2],
            'Oct': [1, 3], 'Nov': [1, 4], 'Dec': [1, 5]
        };

        // Day positions
        this.days = {};
        let day = 1;
        for (let row = 2; row < 6; row++) {
            for (let col = 0; col < 7; col++) {
                this.days[day] = [row, col];
                day++;
            }
        }
        for (let col = 0; col < 3; col++) {
            this.days[day] = [6, col];
            day++;
        }

        // Define the 8 pieces using ASCII art
        const pieceAscii = [
            // Piece 0: 3x2 rectangle (6 cells) - the only hexomino
            `
            ##
            ##
            ##
            `,

            // Piece 1: Tall L pentomino
            `
            #
            #
            #
            ##
            `,

            // Piece 2: P pentomino
            `
            ##
            ##
            #
            `,

            // Piece 3: S pentomino
            `
             ##
             #
            ##
            `,

            // Piece 4: Y pentomino
            `
             #
            ##
             #
             #
            `,

            // Piece 5: C pentomino
            `
            ##
            #
            ##
            `,

            // Piece 6: r pentomino
            `
            ###
            #
            #
            `,

            // Piece 7: N pentomino
            `
             #
             #
            ##
            #
            `
        ];

        this.pieces = pieceAscii.map(p => this.parseAsciiPiece(p));
    }

    parseAsciiPiece(asciiArt) {
        // Split into lines
        let lines = asciiArt.split('\n');

        // Remove leading/trailing empty lines
        while (lines.length > 0 && !lines[0].trim()) {
            lines.shift();
        }
        while (lines.length > 0 && !lines[lines.length - 1].trim()) {
            lines.pop();
        }

        if (lines.length === 0) {
            return [];
        }

        // Find minimum indentation across all non-empty lines
        const nonEmptyLines = lines.filter(line => line.trim());
        if (nonEmptyLines.length === 0) {
            return [];
        }
        const minIndent = Math.min(...nonEmptyLines.map(line =>
            line.length - line.trimStart().length
        ));

        // Remove common indentation and trailing whitespace
        lines = lines.map(line =>
            line.length >= minIndent ? line.slice(minIndent).trimEnd() : line.trimEnd()
        );

        const coords = [];
        for (let row = 0; row < lines.length; row++) {
            for (let col = 0; col < lines[row].length; col++) {
                if (lines[row][col] === '#') {
                    coords.push([row, col]);
                }
            }
        }
        return coords;
    }

    normalizePiece(piece) {
        if (piece.length === 0) return piece;
        const minRow = Math.min(...piece.map(([r, c]) => r));
        const minCol = Math.min(...piece.map(([r, c]) => c));
        return piece.map(([r, c]) => [r - minRow, c - minCol]).sort((a, b) =>
            a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]
        );
    }

    rotate90(piece) {
        return piece.map(([r, c]) => [c, -r]);
    }

    flipHorizontal(piece) {
        return piece.map(([r, c]) => [r, -c]);
    }

    getAllOrientations(piece) {
        const orientations = new Set();
        let current = piece;

        // Try all 4 rotations
        for (let i = 0; i < 4; i++) {
            const normalized = this.normalizePiece(current);
            orientations.add(JSON.stringify(normalized));

            // Also try flipped version
            const flipped = this.flipHorizontal(current);
            const normalizedFlipped = this.normalizePiece(flipped);
            orientations.add(JSON.stringify(normalizedFlipped));

            // Rotate for next iteration
            current = this.rotate90(current);
        }

        return Array.from(orientations).map(s => JSON.parse(s));
    }

    solveBacktrack(month, day) {
        // Create cell index mapping for bitboard
        const cellToIndex = new Map();
        const indexToCell = [];
        let idx = 0;
        for (const cellKey of this.validCells) {
            cellToIndex.set(cellKey, idx);
            const [r, c] = cellKey.split(',').map(Number);
            indexToCell.push([r, c]);
            idx++;
        }

        const monthCell = this.months[month];
        const dayCell = this.days[day];
        const forbiddenIdx1 = cellToIndex.get(`${monthCell[0]},${monthCell[1]}`);
        const forbiddenIdx2 = cellToIndex.get(`${dayCell[0]},${dayCell[1]}`);

        // Create forbidden bitboard
        let forbiddenBits = 0n;
        forbiddenBits |= (1n << BigInt(forbiddenIdx1));
        forbiddenBits |= (1n << BigInt(forbiddenIdx2));

        // Target: all valid cells except forbidden ones
        const totalCells = this.validCells.size;
        const targetBits = (1n << BigInt(totalCells)) - 1n - forbiddenBits;

        // Generate all valid placements with bitboards
        const allPlacements = [];
        for (let pieceIdx = 0; pieceIdx < this.pieces.length; pieceIdx++) {
            const piece = this.pieces[pieceIdx];
            const placements = [];

            for (const orientation of this.getAllOrientations(piece)) {
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        const cells = orientation.map(([dr, dc]) => [r + dr, c + dc]);
                        const cellKeys = cells.map(([row, col]) => `${row},${col}`);

                        // Check if all cells are valid and not forbidden
                        const allValid = cellKeys.every(key =>
                            this.validCells.has(key) && !key.includes(`${monthCell[0]},${monthCell[1]}`) && !key.includes(`${dayCell[0]},${dayCell[1]}`)
                        );

                        if (allValid) {
                            // Convert to bitboard
                            let bitboard = 0n;
                            for (const key of cellKeys) {
                                const index = cellToIndex.get(key);
                                bitboard |= (1n << BigInt(index));
                            }

                            placements.push({
                                pieceIdx,
                                r,
                                c,
                                bits: bitboard,
                                cellsList: cells
                            });
                        }
                    }
                }
            }
            allPlacements.push(placements);
        }

        // Backtracking search with bitboards
        let coveredBits = 0n;
        const solution = [];

        const backtrack = (pieceIdx) => {
            if (pieceIdx === this.pieces.length) {
                return coveredBits === targetBits;
            }

            for (const placement of allPlacements[pieceIdx]) {
                // Check overlap using bitwise AND - O(1) operation!
                if ((coveredBits & placement.bits) === 0n) {
                    // No overlap, place the piece
                    coveredBits |= placement.bits;
                    solution.push({
                        pieceIdx: placement.pieceIdx,
                        r: placement.r,
                        c: placement.c,
                        cells: placement.cellsList.sort((a, b) =>
                            a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]
                        )
                    });

                    if (backtrack(pieceIdx + 1)) {
                        return true;
                    }

                    // Backtrack
                    coveredBits ^= placement.bits;
                    solution.pop();
                }
            }

            return false;
        };

        if (backtrack(0)) {
            return solution;
        }
        return null;
    }
}

// Export for use in browser or Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalendarPuzzle;
}
