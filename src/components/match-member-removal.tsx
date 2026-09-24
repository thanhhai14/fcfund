"use client";

import { removeConfirmedMatchMemberAction } from "@/app/(app)/matches/[id]/actions";
import { ConfirmSubmitButton } from "./confirm-submit-button";
import { Disclosure } from "./disclosure";
import { Icon } from "./icon";
import { MemberIdentity } from "./member-identity";
import { MutationForm } from "./mutation-form";

export function MatchMemberRemoval({
  matchId,
  versionId,
  teamMemberId,
  current,
  teamName,
}: {
  matchId: string;
  versionId: string;
  teamMemberId: string;
  current: { memberId: string | null; name: string; avatarVersion: number | null };
  teamName: string;
}) {
  return (
    <Disclosure
      label={<><Icon name="trash" /> <span>Loại</span></>}
      className="match-replacement-disclosure"
    >
      <div className="replacement-heading">
        <span className="eyebrow">Điều chỉnh đội hình đã chốt</span>
        <h3>Loại cầu thủ khỏi {teamName}</h3>
        <p>
          Cầu thủ sẽ bị loại khỏi danh sách tham gia và đội hình đã xác nhận.
          Các khoản thu của trận không bị thay đổi.
        </p>
      </div>

      <MutationForm
        action={removeConfirmedMatchMemberAction}
        className="replacement-form"
        closeDisclosureOnSuccess
      >
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="versionId" value={versionId} />
        <input type="hidden" name="teamMemberId" value={teamMemberId} />

        <div className="replacement-current">
          <small>Cầu thủ sẽ bị loại</small>
          <MemberIdentity
            memberId={current.memberId}
            name={current.name}
            avatarVersion={current.avatarVersion}
            compact
          />
        </div>

        <label>
          Lý do / ghi chú
          <input
            name="reason"
            maxLength={300}
            placeholder="Ví dụ: báo nghỉ sát giờ, không thi đấu"
          />
        </label>

        <div className="replacement-impact">
          <strong>Xem trước ảnh hưởng</strong>
          <span><Icon name="people-group" /> Xóa khỏi {teamName} và danh sách tham gia</span>
          <span><Icon name="chart" /> Không tạo kết quả cá nhân khi trận chưa ghi kết quả</span>
          <span><Icon name="medal" /> Khoản thu hiện có được giữ nguyên</span>
        </div>

        <ConfirmSubmitButton
          message={`Loại ${current.name} khỏi ${teamName}? Các khoản thu hiện có của trận sẽ được giữ nguyên.`}
          className="button danger"
        >
          Xác nhận loại cầu thủ
        </ConfirmSubmitButton>
      </MutationForm>
    </Disclosure>
  );
}
