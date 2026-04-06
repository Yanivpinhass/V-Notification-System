import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { locationsService, LocationDto } from '@/services/locationsService';
import { LocationDialog } from '@/components/locations/LocationDialog';
import { DeleteLocationDialog } from '@/components/locations/DeleteLocationDialog';
import { Plus, Pencil, Trash2, Loader2, Search, ExternalLink } from 'lucide-react';

export const LocationsManagementPage: React.FC = () => {
  const [locations, setLocations] = useState<LocationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationDto | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState<LocationDto | null>(null);

  const loadLocations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await locationsService.getAll();
      setLocations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const filteredLocations = locations
    .filter(l => l.name.includes(searchTerm) || (l.city && l.city.includes(searchTerm)))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  const handleCreate = () => {
    setEditingLocation(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (l: LocationDto) => {
    setEditingLocation(l);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (l: LocationDto) => {
    setDeletingLocation(l);
    setIsDeleteDialogOpen(true);
  };

  const handleSaved = () => {
    setIsDialogOpen(false);
    setEditingLocation(null);
    loadLocations();
  };

  const handleDeleted = () => {
    setIsDeleteDialogOpen(false);
    setDeletingLocation(null);
    loadLocations();
  };

  return (
    <div className="p-4 max-w-full overflow-hidden">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle>מיקומי ניידות</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleCreate}>
                <Plus className="h-4 w-4 ml-2" />
                חדש
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם או עיר..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? 'לא נמצאו מיקומים התואמים לחיפוש' : 'לא נמצאו מיקומים'}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="text-center font-semibold text-foreground">שם</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">כתובת</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">עיר</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">ניווט</TableHead>
                  <TableHead className="text-center font-semibold text-foreground">פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLocations.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell className="text-right font-medium">{location.name}</TableCell>
                    <TableCell className="text-right">{location.address || '-'}</TableCell>
                    <TableCell className="text-right">{location.city || '-'}</TableCell>
                    <TableCell className="text-center">
                      {location.navigation ? (
                        <a
                          href={location.navigation}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          פתח
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(location)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(location)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <LocationDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        location={editingLocation}
        onSaved={handleSaved}
      />

      <DeleteLocationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        location={deletingLocation}
        onDeleted={handleDeleted}
      />
    </div>
  );
};

export default LocationsManagementPage;
