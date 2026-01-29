import { BaseApiClient } from './api/BaseApiClient';
import { ImportResult } from './volunteersService';

class ShiftsService extends BaseApiClient {
  async uploadShiftsFile(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.postFormData<ImportResult>('/shifts/import', formData);
  }
}

export const shiftsService = new ShiftsService();
