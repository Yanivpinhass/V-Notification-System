import { Home, Users, MessageSquare, Settings, Search } from 'lucide-react';
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
    id: 'message-tracking',
    title: 'מעקב הודעות',
    icon: Search,
    requiredRoles: ['Admin', 'SystemManager'],
    subItems: [
      { id: 'sms-logs', title: 'יומן שליחת הודעות', path: '/message-tracking/sms-logs' },
      { id: 'sms-summary', title: 'סיכום שליחה לפי צוות', path: '/message-tracking/sms-summary' },
      { id: 'scheduler-run-log', title: 'היסטוריית הרצות', path: '/message-tracking/scheduler-run-log' },
    ]
  },
  {
    id: 'settings',
    title: 'הגדרות',
    icon: Settings,
    requiredRoles: ['Admin', 'SystemManager'],
    subItems: [
      { id: 'scheduler-settings', title: 'הגדרות תזמון', path: '/settings/scheduler' },
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
