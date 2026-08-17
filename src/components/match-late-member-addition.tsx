"use client";

import { addConfirmedMatchMemberAction } from "@/app/(app)/matches/[id]/actions";
import { formatMoney } from "@/lib/format";
import { Disclosure } from "./disclosure";
import { Icon } from "./icon";
import { MutationForm, SubmitButton } from "./mutation-form";
import { SearchableMemberSelect, type MemberSelectOption } from "./searchable-member-select";

export function MatchLateMemberAddition({
  matchId,
  versionId,
  team,
  options,
  penaltyQuantity,
  penaltyUnitAmount,
}: {
  matchId: string;
  versionId: string;
  team: { id: string; name: string; place: number | null };
  options: MemberSelectOption[];
  penaltyQuantity: number;
  penaltyUnitAmount: number;
}) {
  const hasResult = team.place !== null;
  return (
    <Disclosure label={<><Icon name="plus" /> <span>Bổ sung cầu thủ</span></>} className="match-add-member-disclosure">
      <div className="replacement-heading">
        <span className="eyebrow">Nhân sự đến trễ</span>
        <h3>Bổ sung vào {team.name}</h3>
        <p>Thêm trực tiếp vào đội hình đã xác nhận, không chia lại các thành viên còn lại.</p>
      </div>
      <MutationForm action={addConfirmedMatchMemberAction} className="replacement-form" closeDisclosureOnSuccess>
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="teamId" value={team.id} />
        <SearchableMemberSelect name="memberId" label="Thành viên đến trễ" placeholder="Tìm thành viên trong club..." options={options} required />
        <label>Seed trong trận<select name="seedTier" defaultValue="" required>
          <option value="" disabled>Chọn Seed</option>
          <option value="TIER_1">Tier 1</option><option value="TIER_2">Tier 2</option>
          <option value="TIER_3">Tier 3</option><option value="TIER_4">Tier 4</option>
          <option value="TIER_5">Tier 5</option><option value="TIER_6">Tier 6</option><option value="TIER_7">Tier 7</option>
        </select></label>
        <label className="checkbox-row"><input type="checkbox" name="assignedAsGoalkeeper" /> Xếp làm thủ môn của đội</label>
        <label>Lý do / ghi chú<input name="reason" maxLength={300} placeholder="Ví dụ: đến trễ, bổ sung hiệp 2" /></label>
        <div className="replacement-impact">
          <strong>Xem trước ảnh hưởng</strong>
          <span><Icon name="people-group" /> Thêm vào {team.name}, không chạy lại bốc thăm</span>
          {hasResult && <>
            <span><Icon name="trophy" /> Đội đã ghi nhận hạng {team.place}</span>
            <span><Icon name="medal" /> Khoản phạt của đội: {penaltyQuantity} lần · {formatMoney(penaltyQuantity * penaltyUnitAmount)}</span>
          </>}
        </div>
        {hasResult && <div className="late-member-result-options">
          <label><input type="checkbox" name="applyResult" defaultChecked /> Ghi nhận kết quả và Điểm phong độ theo đội</label>
          <label><input type="checkbox" name="applyPenalty" defaultChecked={penaltyQuantity > 0} disabled={penaltyQuantity <= 0} /> Áp dụng khoản phạt {penaltyQuantity} lần</label>
        </div>}
        {!options.length && <p className="form-message error">Không còn thành viên hoạt động nào phù hợp để bổ sung.</p>}
        <SubmitButton disabled={!options.length}>Xác nhận bổ sung</SubmitButton>
      </MutationForm>
    </Disclosure>
  );
}
