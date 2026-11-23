// Distributes whole units by largest remainder. Input order breaks ties.
export function apportionUnits(total: bigint, weights: bigint[]) {
  if (total === 0n) return weights.map(() => 0n);
  const denominator = weights.reduce((sum, weight) => sum + weight, 0n);
  if (denominator === 0n) throw new RangeError('Se requieren pesos positivos para distribuir.');
  const shares = weights.map((weight, index) => {
    const weighted = total * weight;
    return { index, whole: weighted / denominator, remainder: weighted % denominator };
  });
  let pending = total - shares.reduce((sum, share) => sum + share.whole, 0n);
  const ranked = [...shares].sort((left, right) =>
    left.remainder === right.remainder
      ? left.index - right.index
      : left.remainder > right.remainder
        ? -1
        : 1,
  );
  for (const share of ranked) {
    if (pending === 0n) break;
    share.whole += 1n;
    pending -= 1n;
  }
  return shares.map(({ whole }) => whole);
}
