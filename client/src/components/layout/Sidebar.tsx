import React from 'react';
import { MenuItem } from './types';

interface SidebarProps {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  activeMainItem: string;
  mainMenuItems: MenuItem[];
  handleMainItemClick: (itemId: string) => void;
  isMobile?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sidebarCollapsed,
  toggleSidebar,
  activeMainItem,
  mainMenuItems,
  handleMainItemClick,
  isMobile = false
}) => {
  return (
    <div className="h-full flex flex-col bg-background border-r border-border relative">
      {/* Gradient Header Bar - Hidden on mobile */}
      {!isMobile && (
        <div
          onClick={toggleSidebar}
          className="h-[56px] cursor-pointer flex items-center justify-end px-4 border-b transition-all duration-300"
          style={{ background: 'linear-gradient(135deg, hsl(210 100% 92%), hsl(210 100% 85%))' }}
        >
          <div className="w-6 h-6 rounded flex items-center justify-center text-gray-600 text-xs font-bold transition-all duration-300 hover:bg-white/20">
            {sidebarCollapsed ? '◀' : '▶'}
          </div>
        </div>
      )}

      {/* Mobile Header */}
      {isMobile && (
        <div
          className="h-[56px] flex items-center justify-center px-4 border-b"
          style={{ background: 'linear-gradient(135deg, hsl(210 100% 92%), hsl(210 100% 85%))' }}
        >
          <h2 className="font-semibold text-gray-700">תפריט ניווט</h2>
        </div>
      )}

      {/* Scrollable Navigation Content */}
      <div className={`${sidebarCollapsed && !isMobile ? 'p-1' : 'p-4'} flex-1 overflow-y-auto`}>
        <nav className={sidebarCollapsed && !isMobile ? 'space-y-1' : 'space-y-2'}>
          {mainMenuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeMainItem === item.id;
            return (
              <div key={item.id}>
                <button
                  onClick={() => handleMainItemClick(item.id)}
                  className={`sidebar-nav-item w-full flex items-center ${
                    sidebarCollapsed && !isMobile
                      ? 'justify-center p-3 min-w-[3rem] h-12'
                      : 'gap-3 px-3 py-3 md:py-2'
                  } rounded-md text-sm md:text-base font-medium ${isActive ? 'active' : ''}`}
                  title={sidebarCollapsed && !isMobile ? item.title : undefined}
                >
                  <Icon size={isMobile ? 22 : sidebarCollapsed ? 20 : 18} />
                  {(!sidebarCollapsed || isMobile) && (
                    <span className="flex-1 text-right truncate">{item.title}</span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
