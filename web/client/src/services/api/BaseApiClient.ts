import { authConfig } from '@/config/auth';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors: string[];
}

export class BaseApiClient {
  protected baseUrl: string;

  private static refreshPromise: Promise<void> | null = null;

  constructor() {
    this.baseUrl = authConfig.apiBaseUrl;
  }

  protected buildUrlWithQuery(endpoint: string, params: Record<string, any> = {}): string {
    // Build the full URL (handle both absolute and relative base URLs)
    const fullUrl = this.baseUrl.startsWith('http')
      ? `${this.baseUrl}${endpoint}`
      : `${window.location.origin}${this.baseUrl}${endpoint}`;

    const url = new URL(fullUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, value.toString());
      }
    });

    return url.toString();
  }

  protected async getAuthHeaders(): Promise<HeadersInit> {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  }

  private async fetchWithAuth(url: string, options: RequestInit): Promise<Response> {
    const headers = await this.getAuthHeaders();
    const mergedOptions = { ...options, headers: { ...headers, ...(options.headers || {}) } };

    let response = await fetch(url, mergedOptions);

    if (response.status === 401) {
      // Try refreshing token (single attempt, deduplicated)
      if (!BaseApiClient.refreshPromise) {
        BaseApiClient.refreshPromise = import('@/services/authService')
          .then(({ authService }) => authService.refreshToken())
          .then(() => {})
          .finally(() => { BaseApiClient.refreshPromise = null; });
      }
      try {
        await BaseApiClient.refreshPromise;
        // Retry with new token
        const newHeaders = await this.getAuthHeaders();
        response = await fetch(url, { ...options, headers: { ...newHeaders, ...(options.headers || {}) } });
      } catch {
        // Refresh failed — authService.refreshToken() already cleared localStorage
        // Reload to show login screen
        window.location.reload();
        throw new Error('Session expired');
      }
    }

    return response;
  }

  protected async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      // Try to parse error body for ApiResponse format with Hebrew messages
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          if (errorData?.message) {
            errorMessage = errorData.message;
          } else if (errorData?.errors && errorData.errors.length > 0) {
            errorMessage = errorData.errors.join(', ');
          }
        }
      } catch {
        // Use default message if parsing fails
      }
      throw new Error(errorMessage);
    }

    // Handle 204 No Content responses (no body to parse)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }

    const result: any = await response.json();

    // Check if this is an ApiResponse wrapper or raw data
    if (result && typeof result === 'object' && 'success' in result) {
      // This is wrapped in ApiResponse
      if (!result.success) {
        const errorMessage = result.message || (result.errors && result.errors.length > 0 ? result.errors.join(', ') : 'API request failed');
        throw new Error(errorMessage);
      }

      if (result.data === undefined) {
        throw new Error('No data received from API');
      }

      return result.data;
    } else {
      // This is raw data, return as-is
      return result;
    }
  }

  protected async get<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    try {
      const url = Object.keys(params).length > 0
        ? this.buildUrlWithQuery(endpoint, params)
        : `${this.baseUrl}${endpoint}`;

      const response = await this.fetchWithAuth(url, {
        method: 'GET',
      });

      return await this.handleResponse<T>(response);
    } catch (error) {
      console.error(`GET ${endpoint} failed:`, error);
      throw error;
    }
  }

  protected async post<T, U = any>(endpoint: string, data?: U): Promise<T> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        ...(data && { body: JSON.stringify(data) }),
      });

      return await this.handleResponse<T>(response);
    } catch (error) {
      console.error(`POST ${endpoint} failed:`, error);
      throw error;
    }
  }

  protected async put<T, U = any>(endpoint: string, data?: U): Promise<T> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}${endpoint}`, {
        method: 'PUT',
        ...(data && { body: JSON.stringify(data) }),
      });

      return await this.handleResponse<T>(response);
    } catch (error) {
      console.error(`PUT ${endpoint} failed:`, error);
      throw error;
    }
  }

  protected async delete<T>(endpoint: string): Promise<T> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE',
      });

      return await this.handleDeleteResponse<T>(response);
    } catch (error) {
      console.error(`DELETE ${endpoint} failed:`, error);
      throw error;
    }
  }

  protected async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const token = localStorage.getItem('accessToken');
    const url = this.baseUrl.startsWith('http')
      ? `${this.baseUrl}${endpoint}`
      : `${window.location.origin}${this.baseUrl}${endpoint}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result && typeof result === 'object' && 'success' in result) {
              if (result.success && result.data !== undefined) {
                resolve(result.data);
              } else {
                reject(new Error(result.message || 'API request failed'));
              }
            } else {
              resolve(result);
            }
          } catch {
            reject(new Error('Failed to parse response'));
          }
        } else {
          let errorMessage = `HTTP ${xhr.status}: ${xhr.statusText}`;
          try {
            const errorData = JSON.parse(xhr.responseText);
            if (errorData?.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // Use default message
          }
          reject(new Error(errorMessage));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
      xhr.addEventListener('timeout', () => reject(new Error('Request timed out')));

      xhr.open('POST', url, true);
      xhr.timeout = 60000;
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      xhr.send(formData);
    });
  }

  protected async handleDeleteResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();

          if (errorData) {
            if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            } else if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
              errorMessage = errorData.errors.join(', ');
            } else if (typeof errorData === 'string') {
              errorMessage = errorData;
            }
          }
        }
      } catch (parseError) {
        console.warn('Failed to parse error response:', parseError);
      }

      throw new Error(errorMessage);
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    const result: ApiResponse<T> = JSON.parse(text);

    if (!result.success) {
      const errorMessage = result.message || (result.errors && result.errors.length > 0 ? result.errors.join(', ') : 'API request failed');
      throw new Error(errorMessage);
    }

    return result.data;
  }
}
