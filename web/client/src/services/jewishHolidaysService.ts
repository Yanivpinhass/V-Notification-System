import { BaseApiClient } from './api/BaseApiClient';

export interface JewishHolidayDto {
  id: number;
  date: string;
  name: string;
}

export interface JewishHolidayRequest {
  date: string;
  name: string;
}

class JewishHolidaysService extends BaseApiClient {
  async getAll(): Promise<JewishHolidayDto[]> {
    return this.get<JewishHolidayDto[]>('/jewish-holidays');
  }

  async create(data: JewishHolidayRequest): Promise<JewishHolidayDto> {
    return this.post<JewishHolidayDto, JewishHolidayRequest>('/jewish-holidays', data);
  }

  async update(id: number, data: JewishHolidayRequest): Promise<JewishHolidayDto> {
    return this.put<JewishHolidayDto, JewishHolidayRequest>(`/jewish-holidays/${id}`, data);
  }

  async deleteHoliday(id: number): Promise<void> {
    return this.delete<void>(`/jewish-holidays/${id}`);
  }
}

export const jewishHolidaysService = new JewishHolidaysService();
