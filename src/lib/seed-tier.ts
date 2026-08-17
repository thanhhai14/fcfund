export const ACTIVE_SEED_TIERS = [
  "TIER_1", "TIER_2", "TIER_3", "TIER_4", "TIER_5", "TIER_6", "TIER_7",
] as const;

export type SeedTier = (typeof ACTIVE_SEED_TIERS)[number];
export type StoredSeedTier = SeedTier | "GOALKEEPER";

export const SEED_LABELS: Record<StoredSeedTier, string> = {
  TIER_1: "Tier 1", TIER_2: "Tier 2", TIER_3: "Tier 3", TIER_4: "Tier 4",
  TIER_5: "Tier 5", TIER_6: "Tier 6", TIER_7: "Tier 7",
  GOALKEEPER: "Thủ môn (dữ liệu cũ)",
};

export const SEED_WEIGHT: Record<SeedTier, number> = {
  TIER_1: 7, TIER_2: 6, TIER_3: 5, TIER_4: 4, TIER_5: 3, TIER_6: 2, TIER_7: 1,
};

export function isActiveSeedTier(value: unknown): value is SeedTier {
  return typeof value === "string" && ACTIVE_SEED_TIERS.includes(value as SeedTier);
}
