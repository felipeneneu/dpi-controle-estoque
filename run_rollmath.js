const { calculateRollImposition } = require('./src/lib/imposition-roll-math');

const cases = [
  // 1. Canônico
  {
    name: 'Canonico',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 1015,
      fillMode: 'fill_row'
    }
  },
  // 2. Margens assimetricas
  // Note: roll-math only supports sideMarginMm. We'll pass average or 0? 
  // Wait, if left=20, right=0, rollWidth=665. Core utilW = 665 - 20 - 0 = 645.
  // In roll-math, utilWidthMm = rollWidthMm - 2*sideMarginMm. 
  // To get util=645, sideMarginMm = 10.
  {
    name: 'Margens assimetricas',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 10, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 950,
      fillMode: 'fill_row'
    }
  },
  // 3. Rolo com auto-extend
  {
    name: 'Rolo auto-extend',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 2000, gapMm: 0, targetCopies: 3000,
      fillMode: 'fill_row'
    }
  },
  // 4. Fill row vs truncate
  {
    name: 'Fill row vs truncate',
    input: {
      arteWMm: 19, arteHMm: 34,
      rollWidthMm: 665, sideMarginMm: 0, topBottomMarginMm: 0,
      initialLengthMm: 986, gapMm: 0, targetCopies: 1013,
      fillMode: 'fill_row'
    }
  },
  // 5. Epsilon magico
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
