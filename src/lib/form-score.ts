export const FORM_SCORE_NEUTRAL = 5_000;
export const FORM_SCORE_LOW_THRESHOLD = 4_000;
export const FORM_SCORE_MIN_SAMPLE = 3;
export const FORM_SCORE_DECAY = 0.9;
export const FORM_SCORE_PRIOR_WEIGHT = 3;
export const FORMULA_VERSION = 1;

export function placementFormScore(teamCount: number, placement: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2) throw new Error("Số đội phải từ 2 trở lên.");
  if (!Number.isInteger(placement) || placement < 1 || placement > teamCount) throw new Error("Thứ hạng không hợp lệ.");
  return Math.round(((teamCount - placement) / (teamCount - 1)) * 10_000);
}

export function calculateAdjustedFormScore(scoresNewestFirst: number[]) {
  if (!scoresNewestFirst.length) return { formScore: FORM_SCORE_NEUTRAL, formConfidence: 0 };
  let weightedScore = 0;
  let weightTotal = 0;
  scoresNewestFirst.forEach((score, index) => {
    const safeScore = Math.min(10_000, Math.max(0, score));
    const weight = FORM_SCORE_DECAY ** index;
    weightedScore += safeScore * weight;
    weightTotal += weight;
  });
  return {
    formScore: Math.round(
      (weightedScore + FORM_SCORE_PRIOR_WEIGHT * FORM_SCORE_NEUTRAL)
      / (weightTotal + FORM_SCORE_PRIOR_WEIGHT),
    ),
    formConfidence: Math.round((weightTotal / (weightTotal + FORM_SCORE_PRIOR_WEIGHT)) * 10_000),
  };
}

export function isLowForm(matchCount: number, formScore: number) {
  return matchCount >= FORM_SCORE_MIN_SAMPLE && formScore < FORM_SCORE_LOW_THRESHOLD;
}
