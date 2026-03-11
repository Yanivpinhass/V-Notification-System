import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { volunteersService, VolunteerDto } from '@/services/volunteersService';
import { VolunteerDialog } from '@/components/volunteers/VolunteerDialog';
import { DeleteVolunteerDialog } from '@/components/volunteers/DeleteVolunteerDialog';
import { Plus, Pencil, Trash2, Loader2, Upload, Search } from 'lucide-react';
import { toast } from 'sonner';

export const VolunteersManagementPage: React.FC = () => {
  const [volunteers, setVolunteers] = useState<VolunteerDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerDto | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingVolunteer, setDeletingVolunteer] = useState<VolunteerDto | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadVolunteers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await volunteersService.getAll();
      setVolunteers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVolunteers();
  }, [loadVolunteers]);

  const filteredVolunteers = volunteers.filter(v =>
    v.mappingName.includes(searchTerm)
  );

  const handleCreate = () => {
    setEditingVolunteer(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (v: VolunteerDto) => {
    setEditingVolunteer(v);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (v: VolunteerDto) => {
    setDeletingVolunteer(v);
    setIsDeleteDialogOpen(true);
  };

  const handleSaved = () => {
    setIsDialogOpen(false);
    setEditingVolunteer(null);
    loadVolunteers();
  };

  const handleDeleted = () => {
    setIsDeleteDialogOpen(false);
    setDeletingVolunteer(null);
    loadVolunteers();
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const result = await volunteersService.uploadVolunteersFile(file);
      toast.success(`ייבוא הושלם: ${result.inserted} חדשים, ${result.updated} עודכנו`);
      if (result.errorMessages.length > 0) {
        result.errorMessages.forEach(msg => toast.error(msg));
      }
      loadVolunteers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בייבוא');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 max-w-full overflow-hidden">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>ניהול מתנדבים</CardTitle>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 ml-2" />
                )}
                ייבוא
              </Button>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 ml-2" />
                חדש
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="חיפוש לפי שם..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-9"
            />
          </div>
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
          ) : filteredVolunteers.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm ? 'לא נמצאו מתנדבים התואמים לחיפוש' : 'לא נמצאו מתנדבים'}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="text-center font-semibold text-foreground">שם</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">טלפון</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">אישור SMS</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVolunteers.map((volunteer) => (
                  <TableRow key={volunteer.id}>
                    <TableCell className="text-right font-medium">{volunteer.mappingName}</TableCell>
                    <TableCell dir="ltr" className="text-left">{volunteer.mobilePhone || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={volunteer.approveToReceiveSms ? 'default' : 'destructive'}
                        className={volunteer.approveToReceiveSms ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        {volunteer.approveToReceiveSms ? 'מאושר' : 'לא מאושר'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(volunteer)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(volunteer)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Volunteer Dialog */}
      <VolunteerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        volunteer={editingVolunteer}
        onSaved={handleSaved}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteVolunteerDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        volunteer={deletingVolunteer}
        onDeleted={handleDeleted}
      />
    </div>
  );
};

export default VolunteersManagementPage;
