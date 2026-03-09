import { authConfig } from '@/config/auth';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: string[];
}

interface VerifyResponse {
  status: 'already_approved' | 'pending_approval';
}

interface SubmitApprovalData {
  internalId: string;
  firstName: string;
  lastName: string;
  mobilePhone: string;
  approveToReceiveSms: boolean;
}

function getErrorMessage(result: ApiResponse<unknown>): string {
  if (result.message) return result.message;
  if (result.errors && result.errors.length > 0) return result.errors[0];
  return 'אירעה שגיאה';
}

class VolunteerSmsService {
  private baseUrl = authConfig.apiBaseUrl;

  async verifyVolunteer(accessKey: string, internalId: string): Promise<VerifyResponse> {
    const response = await fetch(
      `${this.baseUrl}/public/sms-approval/${accessKey}/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internalId }),
      }
    );

    // Handle rate limiting
    if (response.status === 429) {
      throw new Error('יותר מדי בקשות, נסה שוב מאוחר יותר');
    }

    // Try to parse JSON response
    let result: ApiResponse<VerifyResponse>;
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('אירעה שגיאה');
      }
      result = JSON.parse(text);
    } catch {
      throw new Error('אירעה שגיאה');
    }

    if (!result.success) {
      throw new Error(getErrorMessage(result));
    }

    return result.data!;
  }

  async submitApproval(accessKey: string, data: SubmitApprovalData): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/public/sms-approval/${accessKey}/submit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    );

    // Handle rate limiting
    if (response.status === 429) {
      throw new Error('יותר מדי בקשות, נסה שוב מאוחר יותר');
    }

    // Try to parse JSON response
    let result: ApiResponse<void>;
    try {
      const text = await response.text();
      if (!text) {
        throw new Error('אירעה שגיאה בשמירת הנתונים');
      }
      result = JSON.parse(text);
    } catch {
      throw new Error('אירעה שגיאה בשמירת הנתונים');
    }

    if (!result.success) {
      throw new Error(getErrorMessage(result));
    }
  }
}

export const volunteerSmsService = new VolunteerSmsService();
