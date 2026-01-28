import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usersService, UserDto, CreateUserRequest, UpdateUserRequest } from '@/services/usersService';
import { Loader2, RefreshCw } from 'lucide-react';

// Password validation: min 6 chars, at least one letter and one digit
const passwordPattern = /^(?=.*[a-zA-Z])(?=.*\d).{6,}$/;

// Generate a random password (12 chars, includes upper, lower, digits)
const generatePassword = (): string => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = upper + lower + digits;

  // Ensure at least one of each type
  let password = '';
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];

  // Fill the rest randomly
  for (let i = 0; i < 9; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Create user schema (password required)
const createUserSchema = z.object({
  fullName: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים'),
  userName: z.string()
    .min(3, 'שם משתמש חייב להכיל לפחות 3 תווים')
    .max(50, 'שם משתמש יכול להכיל עד 50 תווים')
    .regex(/^[\u0590-\u05FFa-zA-Z0-9_]+$/, 'שם משתמש יכול להכיל רק אותיות בעברית או באנגלית, מספרים או קו תחתון'),
  password: z.string()
    .min(6, 'הסיסמה חייבת להכיל לפחות 6 תווים')
    .regex(passwordPattern, 'הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד'),
  role: z.enum(['Admin', 'SystemManager', 'User'], {
    errorMap: () => ({ message: 'יש לבחור תפקיד' }),
  }),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
});

// Update user schema (password optional)
const updateUserSchema = z.object({
  fullName: z.string().min(2, 'שם מלא חייב להכיל לפחות 2 תווים'),
  userName: z.string()
    .min(3, 'שם משתמש חייב להכיל לפחות 3 תווים')
    .max(50, 'שם משתמש יכול להכיל עד 50 תווים')
    .regex(/^[\u0590-\u05FFa-zA-Z0-9_]+$/, 'שם משתמש יכול להכיל רק אותיות בעברית או באנגלית, מספרים או קו תחתון'),
  newPassword: z.string()
    .optional()
    .refine((val) => !val || passwordPattern.test(val), {
      message: 'הסיסמה חייבת להכיל לפחות 6 תווים, אות אחת ומספר אחד',
    }),
  role: z.enum(['Admin', 'SystemManager', 'User'], {
    errorMap: () => ({ message: 'יש לבחור תפקיד' }),
  }),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
});

type CreateFormData = z.infer<typeof createUserSchema>;
type UpdateFormData = z.infer<typeof updateUserSchema>;

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserDto | null;
  onSaved: () => void;
}

export const UserDialog: React.FC<UserDialogProps> = ({
  open,
  onOpenChange,
  user,
  onSaved,
}) => {
  const isEditing = user !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      fullName: '',
      userName: '',
      password: '',
      role: 'User',
      isActive: true,
      mustChangePassword: true,
    },
  });

  const updateForm = useForm<UpdateFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      fullName: '',
      userName: '',
      newPassword: '',
      role: 'User',
      isActive: true,
      mustChangePassword: false,
    },
  });

  // Reset form when dialog opens/closes or user changes
  useEffect(() => {
    if (open) {
      setError(null);
      setGeneratedPassword(null);
      if (isEditing && user) {
        updateForm.reset({
          fullName: user.fullName,
          userName: user.userName,
          newPassword: '',
          role: user.role as 'Admin' | 'SystemManager' | 'User',
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
        });
      } else {
        createForm.reset({
          fullName: '',
          userName: '',
          password: '',
          role: 'User',
          isActive: true,
          mustChangePassword: true,
        });
      }
    }
  }, [open, user, isEditing, createForm, updateForm]);

  const handleSubmit = async (data: CreateFormData | UpdateFormData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      if (isEditing && user) {
        const updateData = data as UpdateFormData;
        const request: UpdateUserRequest = {
          fullName: updateData.fullName,
          userName: updateData.userName,
          newPassword: updateData.newPassword || undefined,
          role: updateData.role,
          isActive: updateData.isActive,
          mustChangePassword: updateData.mustChangePassword,
        };
        await usersService.updateUser(user.id, request);
      } else {
        const createData = data as CreateFormData;
        const request: CreateUserRequest = {
          fullName: createData.fullName,
          userName: createData.userName,
          password: createData.password,
          role: createData.role,
          isActive: createData.isActive,
          mustChangePassword: createData.mustChangePassword,
        };
        await usersService.createUser(request);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'אירעה שגיאה בשמירת הנתונים');
    } finally {
      setIsSubmitting(false);
    }
  };

  const form = isEditing ? updateForm : createForm;
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">
            {isEditing ? 'עריכת משתמש' : 'משתמש חדש'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName">
              שם מלא <span className="text-red-500">*</span>
            </Label>
            <Input
              id="fullName"
              {...form.register('fullName')}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {errors.fullName && (
              <p className="text-sm text-red-500">{errors.fullName.message}</p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="userName">
              שם משתמש <span className="text-red-500">*</span>
            </Label>
            <Input
              id="userName"
              {...form.register('userName')}
              disabled={isSubmitting}
              dir="ltr"
              className="text-left"
              autoComplete="off"
            />
            {errors.userName && (
              <p className="text-sm text-red-500">{errors.userName.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor={isEditing ? 'newPassword' : 'password'}>
              {isEditing ? 'סיסמה חדשה (השאר ריק לשמירת הקיימת)' : (
                <>סיסמה <span className="text-red-500">*</span></>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                id={isEditing ? 'newPassword' : 'password'}
                type="text"
                {...form.register(isEditing ? 'newPassword' : 'password')}
                disabled={isSubmitting}
                dir="ltr"
                className="text-left flex-1"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  const newPass = generatePassword();
                  setGeneratedPassword(newPass);
                  form.setValue(isEditing ? 'newPassword' : 'password', newPass);
                }}
                disabled={isSubmitting}
                title="צור סיסמה"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {generatedPassword && (
              <p className="text-sm text-green-600 font-mono bg-green-50 p-2 rounded">
                סיסמה שנוצרה: {generatedPassword}
              </p>
            )}
            {(isEditing ? (errors as any).newPassword : (errors as any).password) && (
              <p className="text-sm text-red-500">
                {(isEditing ? (errors as any).newPassword : (errors as any).password)?.message}
              </p>
            )}
          </div>

          {/* Role */}
          <div className="space-y-2">
            <Label>תפקיד</Label>
            <Select
              value={form.watch('role')}
              onValueChange={(value) => form.setValue('role', value as any)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="בחר תפקיד" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="User">משתמש</SelectItem>
                <SelectItem value="SystemManager">מנהל</SelectItem>
                <SelectItem value="Admin">מנהל מערכת</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && (
              <p className="text-sm text-red-500">{errors.role.message}</p>
            )}
          </div>

          {/* Is Active */}
          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">חשבון פעיל</Label>
            <Switch
              id="isActive"
              checked={form.watch('isActive')}
              onCheckedChange={(checked) => form.setValue('isActive', checked)}
              disabled={isSubmitting}
            />
          </div>

          {/* Must Change Password */}
          <div className="flex items-center justify-between">
            <Label htmlFor="mustChangePassword">חייב לשנות סיסמה בהתחברות הבאה</Label>
            <Switch
              id="mustChangePassword"
              checked={form.watch('mustChangePassword')}
              onCheckedChange={(checked) => form.setValue('mustChangePassword', checked)}
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : (
                'שמור'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
