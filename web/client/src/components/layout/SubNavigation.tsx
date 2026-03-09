import React from 'react';
import { MenuItem } from './types';

interface SubNavigationProps {
  currentActiveItem: MenuItem | undefined;
  activeSubItem: string;
  setActiveSubItem: (subItemId: string) => void;
  sidebarCollapsed: boolean;
  isMobile?: boolean;
}

export const SubNavigation: React.FC<SubNavigationProps> = ({
  currentActiveItem,
  activeSubItem,
  setActiveSubItem,
  sidebarCollapsed,
  isMobile = false,
}) => {
  return (
    <div className="sticky top-0 z-20 border-b border-border flex-shrink-0 tab-container">
      {currentActiveItem?.subItems ? (
        <nav className="flex overflow-x-auto">
          {currentActiveItem.subItems.map((subItem) => (
            <button
              key={subItem.id}
              onClick={() => setActiveSubItem(subItem.id)}
              className={`tab-item text-xs md:text-sm whitespace-nowrap ${
                activeSubItem === subItem.id ? 'selected' : ''
              }`}
            >
              {subItem.title}
            </button>
          ))}
        </nav>
      ) : (
        <div className="text-xs md:text-sm text-muted-foreground px-4 md:px-6 py-4">
          {sidebarCollapsed && !isMobile ? '' : 'בחר פריט מהתפריט'}
        </div>
      )}
    </div>
  );
};
