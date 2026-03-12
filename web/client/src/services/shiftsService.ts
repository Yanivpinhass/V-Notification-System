import { BaseApiClient } from './api/BaseApiClient';
import { ImportResult } from './volunteersService';

export interface ShiftWithVolunteerDto {
  id: number;
  shiftDate: string;
  shiftName: string;
  carId: string;
  volunteerId: number;
  volunteerName: string;
  volunteerPhone: string | null;
  volunteerApproved: boolean;
}

export interface CreateShiftRequest {
  shiftDate: string;
  shiftName: string;
  carId: string;
  volunteerId: number;
}

export interface UpdateShiftGroupRequest {
  date: string;
  oldShiftName: string;
  oldCarId: string;
  newShiftName: string;
  newCarId: string;
}

class ShiftsService extends BaseApiClient {
  async uploadShiftsFile(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.postFormData<ImportResult>('/shifts/import', formData);
  }

  async getByDate(date: string): Promise<ShiftWithVolunteerDto[]> {
    return this.get<ShiftWithVolunteerDto[]>('/shifts/by-date', { date });
  }

  async createShift(data: CreateShiftRequest): Promise<ShiftWithVolunteerDto> {
    return this.post<ShiftWithVolunteerDto, CreateShiftRequest>('/shifts', data);
  }

  async deleteShift(id: number): Promise<void> {
    return this.delete<void>(`/shifts/${id}`);
  }

  async sendShiftSms(shiftId: number, templateId?: number): Promise<void> {
    return this.post<void>(`/shifts/${shiftId}/send-sms`, { templateId: templateId ?? null });
  }

  async updateShiftGroup(data: UpdateShiftGroupRequest): Promise<void> {
    return this.put<void, UpdateShiftGroupRequest>('/shifts/update-group', data);
  }
}

export const shiftsService = new ShiftsService();
