import { BaseApiClient } from './api/BaseApiClient';
import { ImportResult } from './volunteersService';

export interface ShiftWithVolunteerDto {
  id: number;
  shiftDate: string;
  shiftName: string;
  carId: string;
  volunteerId: number | null;
  volunteerName: string;
  volunteerPhone: string | null;
  volunteerApproved: boolean;
  isUnresolved: boolean;
  locationId: number | null;
  locationName: string | null;
  locationNavigation: string | null;
  locationCity: string | null;
}

export interface DateShiftInfo {
  date: string;
  hasUnresolved: boolean;
}

export interface CanceledShiftDto {
  id: number;
  shiftDate: string;
  shiftName: string;
  carId: string;
  volunteerId: number | null;
  volunteerName: string | null;
  volunteerPhone: string | null;
  volunteerApproved: boolean;
  locationId: number | null;
  locationName: string | null;
  locationNavigation: string | null;
  locationCity: string | null;
  canceledAt: string | null;
}

export interface CreateShiftRequest {
  shiftDate: string;
  shiftName: string;
  carId: string;
  volunteerId: number;
  locationId?: number | null;
  customLocationName?: string | null;
  customLocationNavigation?: string | null;
}

export interface UpdateShiftGroupRequest {
  date: string;
  oldShiftName: string;
  oldCarId: string;
  newShiftName: string;
  newCarId: string;
  locationId?: number | null;
  customLocationName?: string | null;
  customLocationNavigation?: string | null;
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

  async getDatesWithShifts(from: string, to: string): Promise<DateShiftInfo[]> {
    return this.get<DateShiftInfo[]>('/shifts/dates-with-shifts', { from, to });
  }

  async updateShiftGroup(data: UpdateShiftGroupRequest): Promise<{ alreadySentSms: boolean }> {
    return this.put<{ alreadySentSms: boolean }, UpdateShiftGroupRequest>('/shifts/update-group', data);
  }

  async deleteShiftGroup(data: { date: string; shiftName: string; carId: string; sendNotifications: boolean }): Promise<{ deletedCount: number; smsSentCount: number; smsFailedCount: number }> {
    return this.post('/shifts/delete-group', data);
  }

  async updateGroupLocation(data: { date: string; shiftName: string; carId: string; locationId?: number | null; customLocationName?: string | null; customLocationNavigation?: string | null }): Promise<{ alreadySentSms: boolean }> {
    return this.put('/shifts/update-group-location', data);
  }

  async sendLocationUpdate(data: { date: string; shiftName: string; carId: string }): Promise<{ smsSent: number; smsFailed: number }> {
    return this.post('/shifts/send-location-update', data);
  }

  async cancelShift(id: number, body: { sendNotification: boolean }): Promise<void> {
    return this.post<void, { sendNotification: boolean }>(`/shifts/${id}/cancel`, body);
  }

  async cancelShiftGroup(data: { date: string; shiftName: string; carId: string; sendNotifications: boolean }): Promise<{ canceledCount: number; smsSentCount: number; smsFailedCount: number }> {
    return this.post('/shifts/cancel-group', data);
  }

  async getCanceledShifts(month: string): Promise<CanceledShiftDto[]> {
    return this.get<CanceledShiftDto[]>('/shifts/canceled', { month });
  }
}

export const shiftsService = new ShiftsService();
