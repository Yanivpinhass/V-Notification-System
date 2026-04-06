import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { messageTemplateService, MessageTemplateEntry } from '@/services/messageTemplateService';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { isUserAdmin } from '@/lib/auth';

const CONTENT_MAX_LENGTH = 500;

export const MessageTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<MessageTemplateEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplateEntry | null>(null);
  const [formName, setFormName] = useState('');
  const [formContent, setFormContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MessageTemplateEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isAdmin = isUserAdmin();

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await messageTemplateService.getAll();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בטעינת הנתונים');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormContent('');
    setIsDialogOpen(true);
  };

  const handleEdit = (template: MessageTemplateEntry) => {
    setEditingTemplate(template);
    setFormName(template.name);
    setFormContent(template.content);
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (template: MessageTemplateEntry) => {
    setDeleteTarget(template);
  };

  const validateForm = (): string | null => {
    if (!formName.trim()) return 'שם התבנית הוא שדה חובה';
    if (!formContent.trim()) return 'תוכן התבנית הוא שדה חובה';
    if (formContent.length > CONTENT_MAX_LENGTH) return `תוכן התבנית חייב להכיל עד ${CONTENT_MAX_LENGTH} תווים`;
    if (!formContent.includes('{שם}') || !formContent.includes('{תאריך}')) {
      return 'תבנית חייבת להכיל {שם} ו-{תאריך}';
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSaving(true);
    try {
      if (editingTemplate) {
        await messageTemplateService.update(editingTemplate.id, formName.trim(), formContent);
        toast.success('התבנית עודכנה בהצלחה');
      } else {
        await messageTemplateService.create(formName.trim(), formContent);
        toast.success('התבנית נוצרה בהצלחה');
      }
      setIsDialogOpen(false);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה בשמירת התבנית');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await messageTemplateService.remove(deleteTarget.id);
      toast.success('התבנית נמחקה בהצלחה');
      setDeleteTarget(null);
      await loadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'אירעה שגיאה במחיקת התבנית');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle>הגדרות הודעות</CardTitle>
          {isAdmin && (
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 ml-2" />
              תבנית חדשה
            </Button>
          )}
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
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              לא נמצאו תבניות הודעה
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60">
                  <TableHead className="text-center font-semibold text-foreground">שם</TableHead>
                  {isAdmin && (
                    <TableHead className="text-center font-semibold text-foreground">פעולות</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="text-right font-medium whitespace-nowrap">{template.name}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(template)}
                            disabled={templates.length <= 1}
                            title={templates.length <= 1 ? 'לא ניתן למחוק את התבנית האחרונה' : undefined}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'עריכת תבנית' : 'תבנית חדשה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">שם התבנית</Label>
              <Input
                id="template-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="לדוגמה: תזכורת ליום המשמרת"
                dir="rtl"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template-content">תוכן ההודעה</Label>
                <span className={`text-xs ${formContent.length > CONTENT_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {formContent.length}/{CONTENT_MAX_LENGTH} תווים
                </span>
              </div>
              <Textarea
                id="template-content"
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={4}
                className="resize-none"
                dir="rtl"
              />
              <p className="text-xs text-muted-foreground">
                מילות מפתח: {'{שם}'} {'{שם מלא}'} {'{תאריך}'} {'{יום}'} {'{משמרת}'} {'{רכב}'}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              {editingTemplate ? 'עדכון' : 'יצירה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיקת תבנית</DialogTitle>
          </DialogHeader>
          <p className="py-4">
            האם למחוק את התבנית <strong>"{deleteTarget?.name}"</strong>?
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              מחק
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MessageTemplatesPage;
