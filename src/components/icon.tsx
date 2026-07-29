import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightArrowLeft,
  faBars,
  faCalendar,
  faChartPie,
  faCoins,
  faDroplet,
  faFutbol,
  faGear,
  faGlassWater,
  faHandHoldingDollar,
  faHouse,
  faMoneyBillTransfer,
  faMoneyBillWave,
  faPeopleGroup,
  faPen,
  faPlus,
  faRightFromBracket,
  faShieldHalved,
  faShirt,
  faTriangleExclamation,
  faTrash,
  faTrophy,
  faUser,
  faUsers,
  faWallet,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

const icons: Record<string, IconDefinition> = {
  house: faHouse,
  wallet: faWallet,
  users: faUsers,
  user: faUser,
  "people-group": faPeopleGroup,
  coins: faCoins,
  calendar: faCalendar,
  futbol: faFutbol,
  "glass-water": faGlassWater,
  "triangle-exclamation": faTriangleExclamation,
  "hand-holding-dollar": faHandHoldingDollar,
  shirt: faShirt,
  trophy: faTrophy,
  droplet: faDroplet,
  "money-bill-wave": faMoneyBillWave,
  "money-bill-transfer": faMoneyBillTransfer,
  transactions: faArrowRightArrowLeft,
  chart: faChartPie,
  settings: faGear,
  shield: faShieldHalved,
  logout: faRightFromBracket,
  plus: faPlus,
  edit: faPen,
  trash: faTrash,
  menu: faBars,
};

export function Icon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return <FontAwesomeIcon icon={icons[name] ?? faWallet} className={className} />;
}
