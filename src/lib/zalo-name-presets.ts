import { normalizeVietnameseName } from "@/lib/zalo-name-matching";

const TRAI_LANG_ZALO_MEMBER_CODE_BY_NAME = new Map<string, string>([
  [normalizeVietnameseName("Phan Dũng"), "1"],
  [normalizeVietnameseName("Huy Duc"), "7"],
  [normalizeVietnameseName("Trần Anh Quốc"), "4"],
  [normalizeVietnameseName("Trọng Vinh"), "2"],
  [normalizeVietnameseName("Hòa Chung"), "24"],
  [normalizeVietnameseName("Huỳnh Tú"), "14"],
  [normalizeVietnameseName("Khoa Nguyen"), "9"],
  [normalizeVietnameseName("Le Cao Dang"), "15"],
  [normalizeVietnameseName("Nguyễn Mạnh Hùng"), "23"],
  [normalizeVietnameseName("Nguyễn Vũ"), "19"],
  [normalizeVietnameseName("Sỹ Tấn"), "8"],
  [normalizeVietnameseName("Tamhuynh"), "11"],
  [normalizeVietnameseName("Tường Nguyễn"), "16"],
  [normalizeVietnameseName("VO DINH LY"), "21"],
  [normalizeVietnameseName("Vương Nguyễn"), "0909488226"],
  [normalizeVietnameseName("Hieu Art"), "17"],
  [normalizeVietnameseName("Phú Thành Tấm Nhựa Ốp Tường"), "10"],
  [normalizeVietnameseName("Thanh Bình"), "6"],
  [normalizeVietnameseName("Trần Văn Sĩ"), "20"],
  [normalizeVietnameseName("Trung Hiếu"), "13"],
  [normalizeVietnameseName("Trương Quốc Bảo"), "5"],
  [normalizeVietnameseName("Tuấn Decor Luxury"), "18"],
  [normalizeVietnameseName("Võ Thọ"), "3"],
  [normalizeVietnameseName("Vươngak"), "12"],
  [normalizeVietnameseName("Xuan Son"), "TL01"],
  [normalizeVietnameseName("Nguyễn Thanh Hải"), "38"],
]);

export function getZaloPresetMemberCode(displayName: string) {
  return TRAI_LANG_ZALO_MEMBER_CODE_BY_NAME.get(normalizeVietnameseName(displayName)) ?? null;
}
