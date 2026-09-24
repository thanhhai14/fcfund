export type NotificationChargeItem = {
  name: string;
  quantity: number;
  iconName: string;
  color: string | null;
  reportAsIcon: boolean;
};

export type NotificationPresentationData =
  | {
      version: 1;
      kind: "match_result";
      placement: number;
      teamName: string;
      chargeItems: NotificationChargeItem[];
    }
  | {
      version: 1;
      kind: "charge_created";
      chargeItems: NotificationChargeItem[];
    };

