"use client";

import { replaceConfirmedMatchMemberAction } from "@/app/(app)/matches/[id]/actions";
import { formatMoney } from "@/lib/format";
import { Disclosure } from "./disclosure";
import { Icon } from "./icon";
import { MemberIdentity } from "./member-identity";
import { MutationForm, SubmitButton } from "./mutation-form";
import { SearchableMemberSelect, type MemberSelectOption } from "./searchable-member-select";

export function MatchMemberReplacement({
  matchId,
  versionId,
  teamMemberId,
  current,
  teamName,
  teamPlace,
  chargeQuantity,
  chargeAmount,
  options,
}: {
  matchId: string;
  versionId: string;
  teamMemberId: string;
  current: { memberId: string | null; name: string; avatarVersion: number | null };
  teamName: string;
  teamPlace: number | null;
  chargeQuantity: number;
  chargeAmount: number;
  options: MemberSelectOption[];
}) {
  return (
    <Disclosure label={<><Icon name="transactions" /> <span>Thay</span></>} className="match-replacement-disclosure">
      <div className="replacement-heading">
        <span className="eyebrow">Điều chỉnh sau trận</span>
        <h3>Thay người trong {teamName}</h3>
        <p>Đội và thứ hạng được giữ nguyên. Khoản thu cùng kết quả cá nhân sẽ chuyển sang người thay thế.</p>
      </div>
      <MutationForm action={replaceConfirmedMatchMemberAction} className="replacement-form" closeDisclosureOnSuccess>
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="teamMemberId" value={teamMemberId} />
        <div className="replacement-current">
          <small>Người được thay</small>
          <MemberIdentity memberId={current.memberId} name={current.name} avatarVersion={current.avatarVersion} compact />
        </div>
        <SearchableMemberSelect
          name="replacementMemberId"
          label="Thành viên thay thế"
          placeholder="Tìm thành viên trong club..."
          options={options}
          required
        />
        <label>Lý do điều chỉnh<input name="reason" maxLength={300} placeholder="Ví dụ: ghi nhầm người tham gia" /></label>
        <div className="replacement-impact">
          <strong>Xem trước ảnh hưởng</strong>
          <span><Icon name="people-group" /> Giữ nguyên {teamName}{teamPlace ? ` · Hạng ${teamPlace}` : ""}</span>
          <span><Icon name="medal" /> Chuyển {chargeQuantity} lần khoản thu · {formatMoney(chargeAmount)}</span>
          <span><Icon name="chart" /> Chuyển kết quả và cập nhật điểm phong độ</span>
        </div>
        {!options.length && <p className="form-message error">Không còn thành viên hoạt động nào phù hợp để thay thế.</p>}
        <SubmitButton disabled={!options.length}>Xác nhận thay người</SubmitButton>
      </MutationForm>
    </Disclosure>
  );
}
