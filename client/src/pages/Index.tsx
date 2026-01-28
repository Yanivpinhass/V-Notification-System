import React, { useState } from 'react';
import { AuthScreen } from '@/components/AuthScreen';
import { AdminLayout } from '@/components/AdminLayout';
import { PlaceholderPage } from '@/pages/PlaceholderPage';
import { VolunteersImportPage } from '@/pages/VolunteersImportPage';
import { authService } from '@/services/authService';

interface User {
  name: string;
  email: string;
}

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeSubItem, setActiveSubItem] = useState('dashboard');

  const handleAuthentication = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    setIsAuthenticated(true);
  };

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
      default:
        return <PlaceholderPage />;
    }
  };

  if (!isAuthenticated) {
    return <AuthScreen onAuthenticated={handleAuthentication} />;
  }

  return (
    <AdminLayout
      currentUser={user}
      activeSubItem={activeSubItem}
      onSubItemChange={setActiveSubItem}
      onLogout={handleLogout}
    >
      {renderContent()}
    </AdminLayout>
  );
};

export default Index;
