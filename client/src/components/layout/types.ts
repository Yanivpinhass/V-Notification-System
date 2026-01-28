export interface AdminLayoutProps {
  children: React.ReactNode;
  currentUser?: {
    name: string;
  };
  activeSubItem?: string;
  onSubItemChange?: (subItemId: string) => void;
  onLogout?: () => void;
}

export interface MenuItem {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  requiredRoles?: string[];
  subItems?: Array<{
    id: string;
    title: string;
    path: string;
    requiredRoles?: string[];
  }>;
}

export interface User {
  name: string;
}
