// Espace insécable entre le nombre et son unité : « 12,3 k » ne se coupe jamais en fin de ligne.
const SUFFIXES = ["", "\u00a0k", "\u00a0M", "\u00a0Md", "\u00a0Bn", "\u00a0Bd", "\u00a0Tn", "\u00a0Td", "\u00a0Qn", "\u00a0Qd"];

/** Formate un grand nombre à la française : 1 234, 12,3 k, 4,56 M, 7,89 Md… */
export function formatNumber(n: number, decimalsUnder1000 = 0): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) {
    return sign + abs.toLocaleString("fr-FR", { maximumFractionDigits: decimalsUnder1000, minimumFractionDigits: 0 });
  }
  if (abs < 100_000) return sign + Math.floor(abs).toLocaleString("fr-FR");
  return sign + shortForm(abs);
}

function shortForm(abs: number): string {
  let tier = Math.floor(Math.log10(abs) / 3);
  tier = Math.min(tier, SUFFIXES.length - 1);
  const scaled = abs / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return scaled.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + SUFFIXES[tier];
}

/** Production : notation courte dès 10 000 (« 11,6 k »). */
export function formatRate(n: number): string {
  if (Number.isFinite(n) && Math.abs(n) >= 10_000) return (n < 0 ? "-" : "") + shortForm(Math.abs(n));
  return formatNumber(n, n < 10 ? 1 : 0);
}
