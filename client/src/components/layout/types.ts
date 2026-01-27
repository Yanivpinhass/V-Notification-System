export interface AdminLayoutProps {
  children: React.ReactNode;
  currentUser?: {
    name: string;
    email: string;
  };
  activeSubItem?: string;
  onSubItemChange?: (subItemId: string) => void;
  onLogout?: () => void;
}

export interface MenuItem {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  subItems?: Array<{
    id: string;
    title: string;
    path: string;
  }>;
}

export interface User {
  name: string;
  email: string;
}
