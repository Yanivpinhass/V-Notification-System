import { BaseApiClient } from './api/BaseApiClient';

export interface SchedulerConfigEntry {
  id: number;
  dayGroup: string;
  reminderType: string;
  time: string;
  daysBeforeShift: number;
  isEnabled: number;
  messageTemplateId: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SchedulerConfigUpdate {
  id: number;
  time: string;
  daysBeforeShift: number;
  isEnabled: number;
  messageTemplateId: number;
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

  // Per-row save: updates one config. The route id is authoritative; the body carries the full
  // SchedulerConfigUpdate (id required — Ktor's kotlinx deserializer has no field defaults).
  // Returns the updated row so callers can patch just that row's updatedAt.
  async updateOne(update: SchedulerConfigUpdate): Promise<SchedulerConfigEntry> {
    return this.put<SchedulerConfigEntry>(`/scheduler/config/${update.id}`, update);
  }

  async getRunLog(): Promise<SchedulerRunLogEntry[]> {
    return this.get<SchedulerRunLogEntry[]>('/scheduler/run-log');
  }
}

export const schedulerService = new SchedulerService();
