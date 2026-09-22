export const ZALO_NAME_MATCH_MIN_SCORE = 0.9;
export const ZALO_NAME_MATCH_MIN_GAP = 0.08;

export function normalizeVietnameseName(value: string) {
  return value
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function stringSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshteinDistance(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

export function zaloNameSimilarity(left: string, right: string) {
  const a = normalizeVietnameseName(left);
  const b = normalizeVietnameseName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (compactA === compactB) return 1;

  const tokensA = a.split(" ");
  const tokensB = b.split(" ");
  const shorterTokens = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const longerTokens = tokensA.length <= tokensB.length ? tokensB : tokensA;
  const longerTokenSet = new Set(longerTokens);

  const isMeaningfulTokenSubset = shorterTokens.length >= 2
    && shorterTokens.every((token) => longerTokenSet.has(token));

  const ordered = stringSimilarity(a, b);
  const sortedA = [...tokensA].sort().join(" ");
  const sortedB = [...tokensB].sort().join(" ");
  const tokenSorted = stringSimilarity(sortedA, sortedB);
  const tokenSubset = isMeaningfulTokenSubset ? 0.96 : 0;

  return Math.max(ordered, tokenSorted, tokenSubset);
}

export function passesZaloNameMatchThreshold(bestScore: number, secondScore?: number) {
  if (bestScore < ZALO_NAME_MATCH_MIN_SCORE) return false;
  if (secondScore !== undefined && bestScore - secondScore < ZALO_NAME_MATCH_MIN_GAP) return false;
  return true;
}
