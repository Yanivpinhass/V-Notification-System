import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/services/authService';

interface AuthScreenProps {
  onAuthenticated: (user: { name: string; email: string }) => void;
}

const loginSchema = z.object({
  username: z.string().min(1, 'שם משתמש הוא שדה חובה'),
  password: z.string().min(1, 'סיסמה היא שדה חובה'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const loginResponse = await authService.login(data.username, data.password);

      // Successful authentication
      onAuthenticated({
        name: loginResponse.user.name,
        email: loginResponse.user.email,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.message.includes('שגוי')) {
        setError(error.message);
      } else if (error.message.includes('Network Error') || error.message.includes('fetch')) {
        setError('שגיאת תקשורת עם השרת. אנא בדוק את החיבור לאינטרנט');
      } else {
        setError('שגיאה בהתחברות. אנא נסה שוב מאוחר יותר');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 font-hebrew" dir="rtl">
      <Card className="w-full max-w-md bg-white">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">
            מערכת לניהול תזכורות עבור מערך מתנדבים
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            הזן את פרטי ההתחברות שלך
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-right">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-right block">
                שם משתמש
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="הזן שם משתמש"
                {...register('username')}
                disabled={isLoading}
                className="text-right"
                dir="rtl"
              />
              {errors.username && (
                <p className="text-sm text-destructive text-right">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-right block">
                סיסמה
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="הזן סיסמה"
                {...register('password')}
                disabled={isLoading}
                className="text-right"
                dir="rtl"
              />
              {errors.password && (
                <p className="text-sm text-destructive text-right">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>מתחבר...</span>
                </div>
              ) : (
                'התחבר'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
