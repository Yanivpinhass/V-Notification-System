import { Users, Settings, Search, Calendar } from 'lucide-react';
import { MenuItem } from './types';

export const mainMenuItems: MenuItem[] = [
  {
    id: 'shift-management',
    title: 'ניהול משמרות',
    icon: Calendar,
    requiredRoles: ['Admin', 'SystemManager'],
    subItems: [
      { id: 'shifts-management', title: 'משמרות', path: '/shift-management/shifts' },
      { id: 'shifts-import', title: 'קליטת קובץ משמרות', path: '/shift-management/import' },
    ]
  },
  {
    id: 'volunteer-management',
    title: 'ניהול מתנדבים',
    icon: Users,
    requiredRoles: ['Admin', 'SystemManager'],
    subItems: [
      { id: 'volunteers-management', title: 'ניהול מתנדבים', path: '/volunteer-management/volunteers' },
      { id: 'volunteers-import', title: 'קליטת קובץ מתנדבים', path: '/volunteer-management/import' },
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
      { id: 'sms-settings', title: 'הגדרות SMS', path: '/settings/sms' },
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
