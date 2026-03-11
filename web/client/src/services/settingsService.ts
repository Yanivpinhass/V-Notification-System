import { BaseApiClient } from './api/BaseApiClient';

export interface SimInfo {
  subscriptionId: number;
  displayName: string;
  slotIndex: number;
}

export interface SmsSimSettings {
  subscriptionId: number;
  availableSims: SimInfo[];
}

export interface TestSmsResult {
  success: boolean;
  error: string | null;
}

class SettingsService extends BaseApiClient {
  async getSmsSim(): Promise<SmsSimSettings> {
    return this.get<SmsSimSettings>('/settings/sms-sim');
  }

  async updateSmsSim(subscriptionId: number): Promise<SmsSimSettings> {
    return this.put<SmsSimSettings>('/settings/sms-sim', { subscriptionId });
  }

  async sendTestSms(phoneNumber: string, message?: string): Promise<TestSmsResult> {
    const body: Record<string, string> = { phoneNumber };
    if (message) body.message = message;
    return this.post<TestSmsResult>('/settings/test-sms', body);
  }
}

export const settingsService = new SettingsService();
