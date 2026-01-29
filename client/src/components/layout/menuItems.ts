import { Home, Users, MessageSquare } from 'lucide-react';
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
  },
  {
    id: 'message-management',
    title: 'ניהול הודעות',
    icon: MessageSquare,
    requiredRoles: ['Admin', 'SystemManager'],
    subItems: [
      { id: 'revoke-sms-approval', title: 'ביטול הרשמה להודעות', path: '/message-management/revoke' },
    ]
  },
  {
    id: 'user-management',
    title: 'ניהול משתמשים',
    icon: Users,
    requiredRoles: ['Admin'],
    subItems: [
      { id: 'system-users', title: 'משתמשי מערכת', path: '/user-management/users' },
    ]
  }
];
