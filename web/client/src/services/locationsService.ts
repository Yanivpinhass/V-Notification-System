import { BaseApiClient } from './api/BaseApiClient';

export type LocationType = 'Vehicle' | 'General';

export interface LocationDto {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  navigation: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  locationType: LocationType;
}

export interface LocationRequest {
  name: string;
  address: string | null;
  city: string | null;
  navigation: string | null;
  type?: LocationType;
}

class LocationsService extends BaseApiClient {
  // type: 'Vehicle' (default server-side) | 'General' | 'All'. Omitting it returns Vehicle locations,
  // preserving legacy behavior for the operational picker.
  async getAll(type?: LocationType | 'All'): Promise<LocationDto[]> {
    return this.get<LocationDto[]>('/locations', type ? { type } : undefined);
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
