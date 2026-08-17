import {
  PLAYER_POSITIONS,
  PLAYER_POSITION_LABELS,
  PLAYER_STRENGTHS,
  PLAYER_STRENGTH_LABELS,
  type PlayerPosition,
  type PlayerStrength,
} from "@/lib/player-profile";

export function PlayerRoleFields({
  desiredPositions = [],
  playerStrength = null,
}: {
  desiredPositions?: readonly PlayerPosition[];
  playerStrength?: PlayerStrength | null;
}) {
  return <div className="player-role-fields">
    <fieldset>
      <legend>Vị trí mong muốn <small>Có thể chọn nhiều vị trí</small></legend>
      <div className="player-position-options">
        {PLAYER_POSITIONS.map((position) => <label className="check-field" key={position}>
          <input type="checkbox" name="desiredPositions" value={position} defaultChecked={desiredPositions.includes(position)} />
          <span>{PLAYER_POSITION_LABELS[position]}</span>
        </label>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>Thế mạnh <small>Chọn một hướng chơi</small></legend>
      <div className="player-strength-options">
        {PLAYER_STRENGTHS.map((strength) => <label className="check-field" key={strength}>
          <input type="radio" name="playerStrength" value={strength} defaultChecked={playerStrength === strength} />
          <span>{PLAYER_STRENGTH_LABELS[strength]}</span>
        </label>)}
        <label className="check-field">
          <input type="radio" name="playerStrength" value="" defaultChecked={!playerStrength} />
          <span>Trung lập</span>
        </label>
      </div>
    </fieldset>
  </div>;
}
