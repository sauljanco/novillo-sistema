import type { ReactNode } from 'react'

export type IconName = 'overview' | 'sales' | 'staff' | 'inventory' | 'purchases' | 'menu' | 'reports' | 'access' | 'sun' | 'moon' | 'logout' | 'receipt' | 'search' | 'grill' | 'drink' | 'plus' | 'minus'

const strokes: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  sales: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 15h4m5 0h1" /></>,
  staff: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2H3.5Zm11-14.5a3 3 0 0 1 0 5.5M16 14a5 5 0 0 1 4.5 5v1H17" /></>,
  inventory: <><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" /><path d="m3 7 9 4 9-4M12 11v10M7.5 5 16.5 9" /></>,
  purchases: <><path d="M4 8h16l-1.3 12H5.3L4 8Zm4 0V6a4 4 0 0 1 8 0v2M3 8h18" /><path d="M8 14h8" /></>,
  menu: <><path d="M4 4.5h16v15H4zM8 8h8M8 12h8M8 16h5" /></>,
  reports: <><path d="M4 20V4m0 16h16M8 16v-4m5 4V8m5 8V5" /></>,
  access: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
  moon: <path d="M20.5 13a8.5 8.5 0 0 1-9.5-9.5A8.5 8.5 0 1 0 20.5 13Z" />,
  logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m7-4 4-4-4-4m4 4H9" /></>,
  receipt: <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-3-2-4 2-4-2-3 2z M9 7h6 M9 11h6 M9 15h3" />,
  search: <path d="M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6" />,
  grill: <path d="M3 11h18a9 9 0 0 1-18 0z M7 19l-2 3 M17 19l2 3 M8 7c-3-3 3-3 0-6 M13 7c-3-3 3-3 0-6 M18 7c-3-3 3-3 0-6 M3 14h18" />,
  drink: <path d="M6 6h12l-2 15H8L6 6z M12 6l3-5h5 M7 11h10" />,
  plus: <path d="M12 5v14 M5 12h14" />,
  minus: <path d="M5 12h14" />,
}

export function PanelIcon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{strokes[name]}</svg>
}
