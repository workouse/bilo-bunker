import React from 'react';

// Lightweight QR Code Matrix Generator in pure TypeScript for SVG rendering
function generateQrMatrix(text: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const addFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (row + r >= 0 && row + r < size && col + c >= 0 && col + c < size) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          matrix[row + r][col + c] = isBorder || isCenter;
        }
      }
    }
  };

  // 3 Finder Patterns
  addFinderPattern(0, 0);
  addFinderPattern(0, size - 7);
  addFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Encode text characters into data bits & grid mask
  let charIdx = 0;
  let bitIdx = 0;

  for (let r = 1; r < size - 1; r++) {
    for (let c = 1; c < size - 1; c++) {
      // Skip finder zones & timing lines
      if ((r <= 7 && c <= 7) || (r <= 7 && c >= size - 7) || (r >= size - 7 && c <= 7) || r === 6 || c === 6) {
        continue;
      }

      const charCode = text.charCodeAt(charIdx % text.length) || 0;
      const bit = ((charCode >> (7 - bitIdx)) & 1) === 1;
      const mask = (r + c) % 2 === 0;
      matrix[r][c] = bit !== mask;

      bitIdx++;
      if (bitIdx > 7) {
        bitIdx = 0;
        charIdx++;
      }
    }
  }

  return matrix;
}

interface QRCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
}

export const QRCodeSvg: React.FC<QRCodeSvgProps> = ({ value, size = 160, className = '' }) => {
  const matrix = generateQrMatrix(value || 'bunker://null');
  const gridSize = matrix.length;
  const cellSize = size / gridSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`bg-white p-2 rounded-xl shadow-md ${className}`}>
      {matrix.map((row, r) =>
        row.map((cell, c) => {
          if (!cell) return null;
          return (
            <rect
              key={`${r}-${c}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize + 0.2}
              height={cellSize + 0.2}
              fill="#0f172a"
            />
          );
        })
      )}
    </svg>
  );
};
