import {
  ChartNoAxesCombined,
  CookingPot,
  CupSoda,
  LayoutDashboard,
  LogOut,
  Menu as MenuLines,
  Minus,
  Monitor,
  Moon,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sun,
  UsersRound,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from 'lucide-react'

export type IconName = 'overview' | 'sales' | 'staff' | 'inventory' | 'purchases' | 'menu' | 'reports' | 'access' | 'sun' | 'moon' | 'logout' | 'receipt' | 'search' | 'grill' | 'drink' | 'plus' | 'minus' | 'menuToggle' | 'close'

const icons: Record<IconName, LucideIcon> = {
  overview: LayoutDashboard,
  sales: Monitor,
  staff: UsersRound,
  inventory: Package,
  purchases: ShoppingBag,
  menu: UtensilsCrossed,
  reports: ChartNoAxesCombined,
  access: ShieldCheck,
  sun: Sun,
  moon: Moon,
  logout: LogOut,
  receipt: ReceiptText,
  search: Search,
  grill: CookingPot,
  drink: CupSoda,
  plus: Plus,
  minus: Minus,
  menuToggle: MenuLines,
  close: X,
}

export function PanelIcon({ name }: { name: IconName }) {
  const Icon = icons[name]
  return <Icon aria-hidden="true" size={19} strokeWidth={1.9} />
}
