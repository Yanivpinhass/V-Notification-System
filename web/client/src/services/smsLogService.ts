import { BaseApiClient } from './api/BaseApiClient';

export interface SmsLogEntry {
  id: number;
  sentAt: string;
  shiftDate: string;
  shiftName: string;
  volunteerName: string;
  status: string;
  error: string | null;
}

export interface SmsLogSummaryEntry {
  shiftDate: string;
  shiftName: string;
  totalVolunteers: number;
  sentSuccess: number;
  sentFail: number;
  notSent: number;
}

class SmsLogService extends BaseApiClient {
  async getLogs(days?: number): Promise<SmsLogEntry[]> {
    return this.get<SmsLogEntry[]>('/sms-log', days ? { days } : {});
  }

  async getSummary(days?: number): Promise<SmsLogSummaryEntry[]> {
    return this.get<SmsLogSummaryEntry[]>('/sms-log/summary', days ? { days } : {});
  }
}

export const smsLogService = new SmsLogService();
