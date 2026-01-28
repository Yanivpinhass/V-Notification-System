import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usersService, UserDto } from '@/services/usersService';
import { authService } from '@/services/authService';
import { UserDialog } from '@/components/users/UserDialog';
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

interface SystemUsersPageProps {
  onUserUpdated?: () => void;
}

const roleLabels: Record<string, string> = {
  Admin: 'מנהל מערכת',
  SystemManager: 'מנהל',
  User: 'משתמש',
};

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const SystemUsersPage: React.FC<SystemUsersPageProps> = ({ onUserUpdated }) => {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserDto | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await usersService.getAllUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = () => {
    setEditingUser(null);
    setIsUserDialogOpen(true);
  };

  const handleEditUser = (user: UserDto) => {
    setEditingUser(user);
    setIsUserDialogOpen(true);
  };

  const handleDeleteClick = (user: UserDto) => {
    setDeletingUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleUserSaved = async () => {
    const savedUserId = editingUser?.id;
    setIsUserDialogOpen(false);
    setEditingUser(null);
    await loadUsers();

    // If the edited user is the current logged-in user, update localStorage and notify parent
    if (savedUserId) {
      const currentUser = authService.getCurrentUser();
      if (currentUser && String(currentUser.id) === String(savedUserId)) {
        // Fetch updated user data and update localStorage
        try {
          const updatedUser = await usersService.getUserById(savedUserId);
          const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
          storedUser.name = updatedUser.fullName;
          localStorage.setItem('user', JSON.stringify(storedUser));
          onUserUpdated?.();
        } catch {
          // Silently fail - user data will be refreshed on next login
        }
      }
    }
  };

  const handleUserDeleted = () => {
    setIsDeleteDialogOpen(false);
    setDeletingUser(null);
    loadUsers();
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle>משתמשי מערכת</CardTitle>
          <Button size="sm" onClick={handleCreateUser}>
            <Plus className="h-4 w-4 ml-2" />
            משתמש חדש
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              לא נמצאו משתמשים
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">שם מלא</TableHead>
                  <TableHead className="text-right">שם משתמש</TableHead>
                  <TableHead className="text-right">תפקיד</TableHead>
                  <TableHead className="text-right">סטטוס</TableHead>
                  <TableHead className="text-right">התחברות אחרונה</TableHead>
                  <TableHead className="text-right">נוצר</TableHead>
                  <TableHead className="text-right">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.fullName}</TableCell>
                    <TableCell>{user.userName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={user.role === 'Admin' ? 'default' : 'secondary'}
                      >
                        {roleLabels[user.role] || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.isActive ? 'default' : 'destructive'}
                        className={user.isActive ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        {user.isActive ? 'פעיל' : 'לא פעיל'}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(user.lastConnected)}</TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(user)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit User Dialog */}
      <UserDialog
        open={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        user={editingUser}
        onSaved={handleUserSaved}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteUserDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        user={deletingUser}
        onDeleted={handleUserDeleted}
      />
    </div>
  );
};

export default SystemUsersPage;
