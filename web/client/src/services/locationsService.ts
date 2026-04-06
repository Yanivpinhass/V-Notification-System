import { BaseApiClient } from './api/BaseApiClient';

export interface LocationDto {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  navigation: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LocationRequest {
  name: string;
  address: string | null;
  city: string | null;
  navigation: string | null;
}

class LocationsService extends BaseApiClient {
  async getAll(): Promise<LocationDto[]> {
    return this.get<LocationDto[]>('/locations');
  }

  async getById(id: number): Promise<LocationDto> {
    return this.get<LocationDto>(`/locations/${id}`);
  }

  async create(data: LocationRequest): Promise<LocationDto> {
    return this.post<LocationDto, LocationRequest>('/locations', data);
  }

  async update(id: number, data: LocationRequest): Promise<LocationDto> {
    return this.put<LocationDto, LocationRequest>(`/locations/${id}`, data);
  }

  async deleteLocation(id: number): Promise<void> {
    return this.delete<void>(`/locations/${id}`);
  }
}

export const locationsService = new LocationsService();
