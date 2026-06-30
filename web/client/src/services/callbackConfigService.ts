import { BaseApiClient } from './api/BaseApiClient';

export interface CallbackConfig {
  isActive: boolean;
  gatePhone: string;
  fromHour: string;
  toHour: string;
  allDay: boolean;
  allCallers: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

// The PUT body — server ignores updatedAt/updatedBy (it stamps them itself).
export type CallbackConfigUpdate = Omit<CallbackConfig, 'updatedAt' | 'updatedBy'>;

class CallbackConfigService extends BaseApiClient {
  // baseUrl already ends in /api, so endpoints are written WITHOUT the /api prefix.
  async getConfig(): Promise<CallbackConfig> {
    return this.get<CallbackConfig>('/callback-config');
  }

  async updateConfig(body: CallbackConfigUpdate): Promise<CallbackConfig> {
    return this.put<CallbackConfig>('/callback-config', body);
  }
}

export const callbackConfigService = new CallbackConfigService();
