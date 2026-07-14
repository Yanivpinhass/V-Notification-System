import { BaseApiClient } from './api/BaseApiClient';

// The single administrative-advance scheduler config row (ReminderType='AdminAdvance'). Managed
// separately from the operational scheduler-config cluster (§6c).
export interface AdminSchedulerConfig {
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

// Only the editable fields — DayGroup/ReminderType/DaysBeforeShift are server-owned/immutable.
export interface AdminSchedulerConfigUpdate {
  time: string;
  isEnabled: number;
  messageTemplateId: number;
}

class AdminSchedulerService extends BaseApiClient {
  async getConfig(): Promise<AdminSchedulerConfig> {
    return this.get<AdminSchedulerConfig>('/admin-scheduler/config');
  }

  async updateConfig(update: AdminSchedulerConfigUpdate): Promise<AdminSchedulerConfig> {
    return this.put<AdminSchedulerConfig, AdminSchedulerConfigUpdate>('/admin-scheduler/config', update);
  }
}

export const adminSchedulerService = new AdminSchedulerService();
