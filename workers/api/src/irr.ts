type ItemLabels = Record<string, string>;
type Matrix = Array<{ itemId: string; labels: ItemLabels }>;

function uniqueLabels(matrix: Matrix) {
  return Array.from(new Set(matrix.flatMap((m) => Object.values(m.labels))));
}

export function percentAgreement(matrix: Matrix) {
  let agree = 0;
  let total = 0;
  for (const row of matrix) {
    const v = Object.values(row.labels);
    for (let i = 0; i < v.length; i += 1) {
      for (let j = i + 1; j < v.length; j += 1) {
        total += 1;
        if (v[i] === v[j]) agree += 1;
      }
    }
  }
  return total ? agree / total : 0;
}

export function cohensKappa(labelsA: string[], labelsB: string[]) {
  const n = Math.min(labelsA.length, labelsB.length);
  if (!n) return 0;
  const categories = Array.from(new Set([...labelsA, ...labelsB]));
  let po = 0;
  const aCounts: Record<string, number> = {};
  const bCounts: Record<string, number> = {};
  for (let i = 0; i < n; i += 1) {
    const a = labelsA[i];
    const b = labelsB[i];
    if (a === b) po += 1;
    aCounts[a] = (aCounts[a] ?? 0) + 1;
    bCounts[b] = (bCounts[b] ?? 0) + 1;
  }
  po /= n;
  let pe = 0;
  for (const c of categories) pe += ((aCounts[c] ?? 0) / n) * ((bCounts[c] ?? 0) / n);
  if (pe >= 0.999999) return 1;
  return (po - pe) / (1 - pe);
}

export function fleissKappa(matrix: Matrix) {
  const labels = uniqueLabels(matrix);
  if (!matrix.length || labels.length === 0) return 0;
  const nRaters = Math.max(...matrix.map((m) => Object.keys(m.labels).length));
  if (nRaters < 2) return 0;
  const p: Record<string, number> = {};
  for (const l of labels) p[l] = 0;
  let pBar = 0;
  for (const row of matrix) {
    const counts: Record<string, number> = {};
    for (const l of labels) counts[l] = 0;
    for (const l of Object.values(row.labels)) counts[l] += 1;
    let pi = 0;
    for (const l of labels) {
      p[l] += counts[l];
      pi += counts[l] * (counts[l] - 1);
    }
    pBar += pi / (nRaters * (nRaters - 1));
  }
  pBar /= matrix.length;
  let pE = 0;
  for (const l of labels) {
    const pj = p[l] / (matrix.length * nRaters);
    pE += pj * pj;
  }
  if (pE >= 0.999999) return 1;
  return (pBar - pE) / (1 - pE);
}

export function krippendorffsAlphaNominal(matrix: Matrix) {
  const values = matrix.map((m) => Object.values(m.labels)).filter((a) => a.length > 1);
  if (values.length === 0) return 0;
  let doNum = 0;
  let doDen = 0;
  const globalCounts: Record<string, number> = {};
  for (const row of values) {
    for (let i = 0; i < row.length; i += 1) {
      globalCounts[row[i]] = (globalCounts[row[i]] ?? 0) + 1;
      for (let j = i + 1; j < row.length; j += 1) {
        doDen += 1;
        if (row[i] !== row[j]) doNum += 1;
      }
    }
  }
  const Do = doDen ? doNum / doDen : 0;
  const all = Object.values(globalCounts).reduce((a, b) => a + b, 0);
  if (all <= 1) return 0;
  let deNum = 0;
  for (const [k1, c1] of Object.entries(globalCounts)) {
    for (const [k2, c2] of Object.entries(globalCounts)) {
      if (k1 !== k2) deNum += c1 * c2;
    }
  }
  const De = deNum / (all * (all - 1));
  if (De === 0) return 1;
  return 1 - Do / De;
}

export function buildIrrSummary(matrix: Matrix) {
  const pairs = new Map<string, Array<[string, string]>>();
  const coders = Array.from(new Set(matrix.flatMap((m) => Object.keys(m.labels))));
  for (let i = 0; i < coders.length; i += 1) {
    for (let j = i + 1; j < coders.length; j += 1) pairs.set(`${coders[i]}::${coders[j]}`, []);
  }
  for (const row of matrix) {
    for (let i = 0; i < coders.length; i += 1) {
      for (let j = i + 1; j < coders.length; j += 1) {
        const a = row.labels[coders[i]];
        const b = row.labels[coders[j]];
        if (a && b) pairs.get(`${coders[i]}::${coders[j]}`)?.push([a, b]);
      }
    }
  }
  const pairwise: Record<string, number> = {};
  for (const [k, entries] of pairs) pairwise[k] = cohensKappa(entries.map((x) => x[0]), entries.map((x) => x[1]));
  return {
    total_items: matrix.length,
    overlapping_items: matrix.filter((m) => Object.keys(m.labels).length > 1).length,
    percent_agreement: percentAgreement(matrix),
    fleiss_kappa: fleissKappa(matrix),
    krippendorffs_alpha: krippendorffsAlphaNominal(matrix),
    pairwise
  };
}
