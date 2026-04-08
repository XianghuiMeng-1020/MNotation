export type LabelMatrix = Array<{ itemId: string; labels: Record<string, string> }>;

export function percentAgreement(matrix: LabelMatrix) {
  let agree = 0;
  let total = 0;
  for (const row of matrix) {
    const values = Object.values(row.labels);
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        total += 1;
        if (values[i] === values[j]) agree += 1;
      }
    }
  }
  return total === 0 ? 0 : agree / total;
}
