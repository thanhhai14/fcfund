export const PLAYER_POSITIONS = ["GOALKEEPER", "DEFENDER", "MIDFIELDER", "FORWARD"] as const;
export type PlayerPosition = typeof PLAYER_POSITIONS[number];

export const PLAYER_POSITION_LABELS: Record<PlayerPosition, string> = {
  GOALKEEPER: "Thủ môn",
  DEFENDER: "Hậu vệ",
  MIDFIELDER: "Tiền vệ",
  FORWARD: "Tiền đạo",
};

export const PLAYER_STRENGTHS = ["DEFENSE", "ATTACK"] as const;
export type PlayerStrength = typeof PLAYER_STRENGTHS[number];

export const PLAYER_STRENGTH_LABELS: Record<PlayerStrength, string> = {
  DEFENSE: "Phòng thủ",
  ATTACK: "Tấn công",
};

export function isPlayerPosition(value: string): value is PlayerPosition {
  return PLAYER_POSITIONS.includes(value as PlayerPosition);
}

export function isPlayerStrength(value: string): value is PlayerStrength {
  return PLAYER_STRENGTHS.includes(value as PlayerStrength);
}

export function playerPositionsLabel(positions: readonly PlayerPosition[] | null | undefined) {
  return positions?.length ? positions.map((position) => PLAYER_POSITION_LABELS[position]).join(", ") : "Linh hoạt";
}

export function playerStrengthLabel(strength: PlayerStrength | null | undefined) {
  return strength ? PLAYER_STRENGTH_LABELS[strength] : "Trung lập";
}
