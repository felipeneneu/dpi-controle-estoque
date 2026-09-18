import { calculateRollImposition } from './src/lib/imposition-roll-math.ts';

const cases = [
  {
    name: 'Canonico',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 1015,
      fillMode: 'fill_row'
    }
  },
  {
    name: 'Margens assimetricas',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 10, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 950,
      fillMode: 'fill_row'
    }
  },
  {
    name: 'Rolo auto-extend',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 2000, gapMm: 0, targetCopies: 3000,
      fillMode: 'fill_row'
    }
  },
  {
    name: 'Fill row vs truncate',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 1013,
      fillMode: 'fill_row'
    }
  },
  {
    name: 'Epsilon magico',
    input: {
      arteWMm: 33.33333333, arteHMm: 34,
      rollWidthMm: 100, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 10,
      fillMode: 'fill_row'
    }
  }
];

const results = cases.map(c => {
  try {
    const res = calculateRollImposition(c.input);
    return { name: c.name, cols: res.cols, rows: res.rows, total: res.totalCopies, orientation: res.orientation };
  } catch (e) {
    return { name: c.name, error: e.message };
  }
});

console.log(JSON.stringify(results, null, 2));
