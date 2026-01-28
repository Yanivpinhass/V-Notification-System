import { BaseApiClient } from './api/BaseApiClient';

export interface ImportResult {
  totalRows: number;
  inserted: number;
  updated: number;
  errors: number;
  errorMessages: string[];
}

class VolunteersService extends BaseApiClient {
  async uploadVolunteersFile(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.postFormData<ImportResult>('/volunteers/import', formData);
  }
}

export const volunteersService = new VolunteersService();
