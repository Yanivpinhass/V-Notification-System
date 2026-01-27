import { Home } from 'lucide-react';
import { MenuItem } from './types';

export const mainMenuItems: MenuItem[] = [
  {
    id: 'data-import',
    title: 'קליטת נתונים',
    icon: Home,
    subItems: [
      { id: 'shifts-import', title: 'קליטת קובץ משמרות', path: '/data-import/shifts' },
      { id: 'volunteers-import', title: 'קליטת קובץ מתנדבים', path: '/data-import/volunteers' },
    ]
  }
];
