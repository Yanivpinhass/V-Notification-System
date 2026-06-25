import React, { useState, useCallback } from 'react';
import { AuthScreen } from '@/components/AuthScreen';
import { AdminLayout } from '@/components/AdminLayout';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { VolunteersImportPage } from '@/pages/VolunteersImportPage';
import { SystemUsersPage } from '@/pages/SystemUsersPage';
import { VolunteersManagementPage } from '@/pages/VolunteersManagementPage';
import { ShiftsImportPage } from '@/pages/ShiftsImportPage';
import { SmsLogsPage } from '@/pages/SmsLogsPage';
import { SmsLogSummaryPage } from '@/pages/SmsLogSummaryPage';
import { SchedulerSettingsPage } from '@/pages/SchedulerSettingsPage';
import { SchedulerRunLogPage } from '@/pages/SchedulerRunLogPage';
import { SmsSettingsPage } from '@/pages/SmsSettingsPage';
import { ShiftsManagementPage } from '@/pages/ShiftsManagementPage';
import { CanceledShiftsPage } from '@/pages/CanceledShiftsPage';
import { MessageTemplatesPage } from '@/pages/MessageTemplatesPage';
import { AboutVersionPage } from '@/pages/AboutVersionPage';
import { LocationsManagementPage } from '@/pages/LocationsManagementPage';
import { JewishHolidaysPage } from '@/pages/JewishHolidaysPage';
import { DutyLogPage } from '@/pages/DutyLogPage';
import { DutyLogPreviewProvider } from '@/features/duty-log/DutyLogPreviewProvider';
import { authService } from '@/services/authService';

interface User {
  name: string;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(() => {
    const currentUser = authService.getCurrentUser();
    return currentUser ? { name: currentUser.name } : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => authService.isAuthenticated());
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [activeSubItem, setActiveSubItem] = useState('shifts-management');

  const handleAuthentication = (authenticatedUser: User, needsPasswordChange: boolean) => {
    setUser(authenticatedUser);
    setIsAuthenticated(true);
    setMustChangePassword(needsPasswordChange);
  };

  const handlePasswordChanged = () => {
    setMustChangePassword(false);
  };

  // Refresh user info from localStorage (called after user edits)
  const refreshUserInfo = useCallback(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser({ name: currentUser.name });
    }
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  // Function to render content based on active sub-item
  const renderContent = () => {
    switch (activeSubItem) {
      case 'dashboard':
        return <PlaceholderPage />;
      case 'volunteers-import':
        return <VolunteersImportPage />;
      case 'system-users':
        return <SystemUsersPage onUserUpdated={refreshUserInfo} />;
      case 'sms-logs':
        return <SmsLogsPage />;
      case 'sms-summary':
        return <SmsLogSummaryPage />;
      case 'volunteers-management':
        return <VolunteersManagementPage />;
      case 'locations-management':
        return <LocationsManagementPage />;
      case 'shifts-import':
        return <ShiftsImportPage />;
      case 'scheduler-settings':
        return <SchedulerSettingsPage />;
      case 'scheduler-run-log':
        return <SchedulerRunLogPage />;
      case 'sms-settings':
        return <SmsSettingsPage />;
      case 'shifts-management':
        return <ShiftsManagementPage />;
      case 'canceled-shifts':
        return <CanceledShiftsPage />;
      case 'message-templates':
        return <MessageTemplatesPage />;
      case 'jewish-holidays':
        return <JewishHolidaysPage />;
      case 'duty-log':
        return <DutyLogPage />;
      case 'about-version':
        return <AboutVersionPage />;
      default:
        return <PlaceholderPage />;
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={handleAuthentication} />;
  }

  return (
    <>
      {/* Provider lives ABOVE AdminLayout so the duty-log preview survives the
          mobile↔desktop tree swap that AdminLayout does on rotation (768px breakpoint). */}
      <DutyLogPreviewProvider>
        <AdminLayout
          currentUser={user}
          activeSubItem={activeSubItem}
          onSubItemChange={setActiveSubItem}
          onLogout={handleLogout}
        >
          {renderContent()}
        </AdminLayout>
      </DutyLogPreviewProvider>

      {/* Force password change dialog */}
      <ChangePasswordDialog
        open={mustChangePassword}
        onPasswordChanged={handlePasswordChanged}
      />
    </>
  );
};

export default Index;
