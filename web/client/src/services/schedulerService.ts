import { BaseApiClient } from './api/BaseApiClient';

export interface SchedulerConfigEntry {
  id: number;
  dayGroup: string;
  reminderType: string;
  time: string;
  daysBeforeShift: number;
  isEnabled: number;
  messageTemplate: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SchedulerConfigUpdate {
  id: number;
  time: string;
  daysBeforeShift: number;
  isEnabled: number;
  messageTemplate: string;
}

export interface SchedulerRunLogEntry {
  id: number;
  configId: number;
  reminderType: string;
  ranAt: string;
  targetDate: string;
  totalEligible: number;
  smsSent: number;
  smsFailed: number;
  status: string;
  error: string | null;
}

class SchedulerService extends BaseApiClient {
  async getConfig(): Promise<SchedulerConfigEntry[]> {
    return this.get<SchedulerConfigEntry[]>('/scheduler/config');
  }

  async updateConfig(configs: SchedulerConfigUpdate[]): Promise<void> {
    return this.put<void>('/scheduler/config', configs);
  }

  async getRunLog(): Promise<SchedulerRunLogEntry[]> {
    return this.get<SchedulerRunLogEntry[]>('/scheduler/run-log');
  }
}

export const schedulerService = new SchedulerService();
