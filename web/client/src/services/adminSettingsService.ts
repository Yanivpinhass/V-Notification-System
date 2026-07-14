import { BaseApiClient } from './api/BaseApiClient';

// The two administrative template-role ids (assignment + today). The advance template id lives on
// the admin SchedulerConfig row instead (adminSchedulerService).
export interface AdminTemplates {
  assignmentTemplateId: number | null;
  todayTemplateId: number | null;
}

export interface AdminTemplatesUpdate {
  assignmentTemplateId: number;
  todayTemplateId: number;
}

class AdminSettingsService extends BaseApiClient {
  async getTemplates(): Promise<AdminTemplates> {
    return this.get<AdminTemplates>('/admin-settings/templates');
  }

  async updateTemplates(update: AdminTemplatesUpdate): Promise<void> {
    return this.put<void, AdminTemplatesUpdate>('/admin-settings/templates', update);
  }
}

export const adminSettingsService = new AdminSettingsService();
