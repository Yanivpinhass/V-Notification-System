import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, User, Menu, LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { User as UserType } from './types';

interface HeaderProps {
  currentUser: UserType;
  isMobile?: boolean;
  onMenuClick?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  isMobile = false,
  onMenuClick,
  onLogout
}) => {
  return (
    <header className="admin-header flex items-center justify-between px-4 md:px-6">
      {/* Right side (appears left in RTL) - Account dropdown and Mobile menu */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-1 md:gap-2 text-foreground text-sm md:text-base">
              <ChevronDown size={14} className="md:w-4 md:h-4" />
              <span className="hidden sm:inline">{currentUser.name}</span>
              <User size={18} className="md:w-5 md:h-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-right">
              <div className="flex flex-col items-end w-full">
                <span className="font-medium">{currentUser.name}</span>
                <span className="text-sm text-muted-foreground">{currentUser.email}</span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem className="text-right cursor-pointer" onClick={onLogout}>
              <div className="flex items-center justify-end gap-2 w-full">
                <span>התנתק</span>
                <LogOut size={16} />
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            className="flex items-center justify-center w-8 h-8 p-0"
          >
            <Menu size={20} />
          </Button>
        )}
      </div>

      <h1 className="font-bold text-foreground text-lg md:text-2xl text-center flex-1 md:flex-none">
        מערכת לניהול תזכורות עבור מערך מתנדבים
      </h1>

      {/* Left side (appears right in RTL) - Empty for now */}
      <div className="flex items-center gap-2">
        {/* Placeholder for future elements */}
      </div>
    </header>
  );
};
