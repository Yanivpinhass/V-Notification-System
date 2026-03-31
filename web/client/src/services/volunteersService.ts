import { BaseApiClient } from './api/BaseApiClient';

export interface VolunteerDto {
  id: number;
  mappingName: string;
  mobilePhone: string | null;
  approveToReceiveSms: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateVolunteerRequest {
  mappingName: string;
  mobilePhone: string | null;
  approveToReceiveSms: boolean;
}

export interface UpdateVolunteerRequest {
  mappingName: string;
  mobilePhone: string | null;
  approveToReceiveSms: boolean;
}

export interface ImportResult {
  totalRows: number;
  inserted: number;
  updated: number;
  errors: number;
  errorMessages: string[];
  unresolvedVolunteers: number;
  unresolvedVolunteerNames: string[];
}

class VolunteersService extends BaseApiClient {
  async getAll(): Promise<VolunteerDto[]> {
    return this.get<VolunteerDto[]>('/volunteers');
  }

  async getById(id: number): Promise<VolunteerDto> {
    return this.get<VolunteerDto>(`/volunteers/${id}`);
  }

  async create(data: CreateVolunteerRequest): Promise<VolunteerDto> {
    return this.post<VolunteerDto, CreateVolunteerRequest>('/volunteers', data);
  }

  async update(id: number, data: UpdateVolunteerRequest): Promise<VolunteerDto> {
    return this.put<VolunteerDto, UpdateVolunteerRequest>(`/volunteers/${id}`, data);
  }

  async deleteVolunteer(id: number): Promise<void> {
    return this.delete<void>(`/volunteers/${id}`);
  }

  async uploadVolunteersFile(file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.postFormData<ImportResult>('/volunteers/import', formData);
  }
}

export const volunteersService = new VolunteersService();
