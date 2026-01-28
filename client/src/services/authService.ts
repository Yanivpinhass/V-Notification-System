import { authConfig } from '@/config/auth';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserInfo;
  mustChangePassword: boolean;
}

export interface UserInfo {
  id: string;
  name: string;
  roles: string[];
  permissions: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

class AuthService {
  private baseUrl = authConfig.apiBaseUrl.includes('/api')
    ? authConfig.apiBaseUrl
    : `${authConfig.apiBaseUrl}/api`;

  private buildUrl(endpoint: string): string {
    if (this.baseUrl.startsWith('http')) {
      return `${this.baseUrl}${endpoint}`;
    }
    return `${window.location.origin}${this.baseUrl}${endpoint}`;
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    try {
      const response = await fetch(this.buildUrl('/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
        } as LoginRequest),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('שם משתמש או סיסמה שגויים');
        }
        throw new Error(`Login failed: ${response.statusText}`);
      }

      const result: ApiResponse<LoginResponse> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Login failed');
      }

      // Store tokens in localStorage for persistence
      localStorage.setItem('accessToken', result.data.accessToken);
      localStorage.setItem('refreshToken', result.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.data.user));

      return result.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  async refreshToken(): Promise<LoginResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(this.buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const result: ApiResponse<LoginResponse> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Token refresh failed');
      }

      // Update stored tokens
      localStorage.setItem('accessToken', result.data.accessToken);
      localStorage.setItem('refreshToken', result.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.data.user));

      return result.data;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.logout(); // Clear invalid tokens
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      const accessToken = localStorage.getItem('accessToken');
      if (accessToken) {
        await fetch(this.buildUrl('/auth/logout'), {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear all stored authentication data
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  }

  getCurrentUser(): UserInfo | null {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken() && !!this.getCurrentUser();
  }

  async changePassword(newPassword: string): Promise<void> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('לא מחובר למערכת');
    }

    const response = await fetch(this.buildUrl('/auth/change-password'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ newPassword }),
    });

    if (!response.ok) {
      let errorMessage = 'שגיאה בשינוי הסיסמה';
      try {
        const result = await response.json();
        if (result?.message) {
          errorMessage = result.message;
        }
      } catch {
        // Use default message
      }
      throw new Error(errorMessage);
    }
  }
}

export const authService = new AuthService();
