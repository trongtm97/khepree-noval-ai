import {
  LayoutDashboard,
  FolderKanban,
  Languages,
  ListTodo,
  BookOpen,
  Search,
  type LucideIcon,
} from 'lucide-react';

/**
 * Authoritative primary sidebar nav order (HARD REQUIREMENT 17).
 * Rendered by array index — not CSS `order`.
 *
 * Required adjacency: Dự án (`/projects`) immediately followed by Dịch (`nav.translation`).
 */
export type PrimaryNavItem = {
  to: string;
  key: string;
  icon: LucideIcon;
  end?: boolean;
  translation?: boolean;
};

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', key: 'nav.projects', icon: FolderKanban },
  { to: '__translation__', key: 'nav.translation', icon: Languages, translation: true },
  { to: '/series', key: 'nav.series', icon: BookOpen },
  { to: '/search', key: 'nav.search', icon: Search },
  { to: '/jobs', key: 'nav.production', icon: ListTodo },
] as const;
