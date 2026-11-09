const SUFFIXES = ["", " k", " M", " Md", " Bn", " Bd", " Tn", " Td", " Qn"];

/** Formate un grand nombre à la française : 1 234, 12,3 k, 4,56 M, 7,89 Md… */
export function formatNumber(n: number, decimalsUnder1000 = 0): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) {
    return sign + abs.toLocaleString("fr-FR", { maximumFractionDigits: decimalsUnder1000, minimumFractionDigits: 0 });
  }
  if (abs < 100_000) return sign + Math.floor(abs).toLocaleString("fr-FR");
  let tier = Math.floor(Math.log10(abs) / 3);
  tier = Math.min(tier, SUFFIXES.length - 1);
  const scaled = abs / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return sign + scaled.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + SUFFIXES[tier];
}

export function formatRate(n: number): string {
  return formatNumber(n, n < 10 ? 1 : 0);
}
