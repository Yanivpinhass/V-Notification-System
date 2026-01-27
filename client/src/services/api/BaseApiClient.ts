import { authConfig } from '@/config/auth';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors: string[];
}

export class BaseApiClient {
  protected baseUrl: string;

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

  protected async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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

      const response = await fetch(url, {
        method: 'GET',
        headers: await this.getAuthHeaders(),
      });

      return await this.handleResponse<T>(response);
    } catch (error) {
      console.error(`GET ${endpoint} failed:`, error);
      throw error;
    }
  }

  protected async post<T, U = any>(endpoint: string, data?: U): Promise<T> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
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
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'PUT',
        headers: await this.getAuthHeaders(),
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
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'DELETE',
        headers: await this.getAuthHeaders(),
      });

      return await this.handleDeleteResponse<T>(response);
    } catch (error) {
      console.error(`DELETE ${endpoint} failed:`, error);
      throw error;
    }
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
