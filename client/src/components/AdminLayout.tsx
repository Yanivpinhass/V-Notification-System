import React, { useState, useEffect } from 'react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { AdminLayoutProps } from './layout/types';
import { mainMenuItems } from './layout/menuItems';
import { Header } from './layout/Header';
import { Sidebar } from './layout/Sidebar';
import { SubNavigation } from './layout/SubNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import { authService } from '@/services/authService';

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  currentUser = { name: 'משתמש' },
  activeSubItem: externalActiveSubItem,
  onSubItemChange,
  onLogout
}) => {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeMainItem, setActiveMainItem] = useState('home');
  const [internalActiveSubItem, setInternalActiveSubItem] = useState('dashboard');

  // Role-based menu filtering
  const currentUserInfo = authService.getCurrentUser();
  const userRoles = currentUserInfo?.roles || [];

  const filteredMenuItems = mainMenuItems
    .filter(item => !item.requiredRoles || item.requiredRoles.some(r => userRoles.includes(r)))
    .map(item => ({
      ...item,
      subItems: item.subItems?.filter(sub => !sub.requiredRoles || sub.requiredRoles.some(r => userRoles.includes(r)))
    }))
    .filter(item => !item.subItems || item.subItems.length > 0);

  // Use external state if provided, otherwise use internal state
  const activeSubItem = externalActiveSubItem || internalActiveSubItem;
  const setActiveSubItem = onSubItemChange || setInternalActiveSubItem;

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  }, [isMobile]);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const handleMainItemClick = (itemId: string) => {
    setActiveMainItem(itemId);
    // Reset sub item when switching main items
    const item = filteredMenuItems.find(item => item.id === itemId);
    if (item?.subItems?.length) {
      setActiveSubItem(item.subItems[0].id);
    }
    // Close mobile menu when item is selected
    if (isMobile) {
      setMobileMenuOpen(false);
    }
  };

  const getCurrentActiveItem = () => {
    return filteredMenuItems.find(item => item.id === activeMainItem);
  };

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="h-screen bg-background font-hebrew flex flex-col" dir="rtl">
        {/* Header */}
        <div className="bg-background border-b border-border">
          <Header
            currentUser={currentUser}
            isMobile={isMobile}
            onMenuClick={() => setMobileMenuOpen(true)}
            onLogout={onLogout}
          />
        </div>

        {/* Mobile Sidebar Sheet */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="right" className="w-80 p-0">
            <Sidebar
              sidebarCollapsed={false}
              toggleSidebar={() => {}}
              activeMainItem={activeMainItem}
              mainMenuItems={filteredMenuItems}
              handleMainItemClick={handleMainItemClick}
              isMobile={true}
            />
          </SheetContent>
        </Sheet>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col">
            <div className="admin-card h-full flex flex-col p-0 overflow-hidden">
              <SubNavigation
                currentActiveItem={getCurrentActiveItem()}
                activeSubItem={activeSubItem}
                setActiveSubItem={setActiveSubItem}
                sidebarCollapsed={false}
                isMobile={true}
              />
              <div className="flex-1 p-4 overflow-auto">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="h-screen bg-background font-hebrew flex flex-col" dir="rtl">
      {/* Header */}
      <div className="bg-background border-b border-border">
        <Header currentUser={currentUser} isMobile={false} onLogout={onLogout} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          {/* Sidebar */}
          <ResizablePanel
            defaultSize={sidebarCollapsed ? 8 : 20}
            minSize={sidebarCollapsed ? 8 : 15}
            maxSize={sidebarCollapsed ? 8 : 35}
            className={sidebarCollapsed ? "!w-16 mt-3" : "mt-3"}
          >
            <Sidebar
              sidebarCollapsed={sidebarCollapsed}
              toggleSidebar={toggleSidebar}
              activeMainItem={activeMainItem}
              mainMenuItems={filteredMenuItems}
              handleMainItemClick={handleMainItemClick}
              isMobile={false}
            />
          </ResizablePanel>

          <ResizableHandle withHandle className={sidebarCollapsed ? "hidden" : ""} />

          {/* Content Panel */}
          <ResizablePanel defaultSize={sidebarCollapsed ? 92 : 80} className="flex flex-col">
            {/* Page Content - Scrollable with reduced padding */}
            <div className="flex-1 overflow-auto bg-gray-50">
              <div className="p-2 h-full">
                <div className="admin-card h-full flex flex-col p-0 overflow-hidden">
                  <SubNavigation
                    currentActiveItem={getCurrentActiveItem()}
                    activeSubItem={activeSubItem}
                    setActiveSubItem={setActiveSubItem}
                    sidebarCollapsed={sidebarCollapsed}
                    isMobile={false}
                  />
                  <div className="flex-1 p-6 overflow-auto">
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
};
