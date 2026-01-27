import { Home } from 'lucide-react';
import { MenuItem } from './types';

export const mainMenuItems: MenuItem[] = [
  {
    id: 'home',
    title: 'ראשי',
    icon: Home,
    subItems: [
      { id: 'dashboard', title: 'לוח בקרה', path: '/home/dashboard' },
    ]
  }
];
