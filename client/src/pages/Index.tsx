import React, { useState, useCallback } from 'react';
import { AuthScreen } from '@/components/AuthScreen';
import { AdminLayout } from '@/components/AdminLayout';
import { ChangePasswordDialog } from '@/components/ChangePasswordDialog';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { VolunteersImportPage } from '@/pages/VolunteersImportPage';
import { SystemUsersPage } from '@/pages/SystemUsersPage';
import { RevokeSmsApprovalPage } from '@/pages/RevokeSmsApprovalPage';
import { ShiftsImportPage } from '@/pages/ShiftsImportPage';
import { authService } from '@/services/authService';

interface User {
  name: string;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [activeSubItem, setActiveSubItem] = useState('shifts-import');

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
      case 'revoke-sms-approval':
        return <RevokeSmsApprovalPage />;
      case 'shifts-import':
        return <ShiftsImportPage />;
      default:
        return <PlaceholderPage />;
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={handleAuthentication} />;
  }

  return (
    <>
      <AdminLayout
        currentUser={user}
        activeSubItem={activeSubItem}
        onSubItemChange={setActiveSubItem}
        onLogout={handleLogout}
      >
        {renderContent()}
      </AdminLayout>

      {/* Force password change dialog */}
      <ChangePasswordDialog
        open={mustChangePassword}
        onPasswordChanged={handlePasswordChanged}
      />
    </>
  );
};

export default Index;
