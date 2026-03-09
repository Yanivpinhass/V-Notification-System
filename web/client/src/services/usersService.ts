import { BaseApiClient } from './api/BaseApiClient';

export interface UserDto {
  id: number;
  fullName: string;
  userName: string;
  isActive: boolean;
  role: string;
  mustChangePassword: boolean;
  lastConnected: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  fullName: string;
  userName: string;
  password: string;
  role: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface UpdateUserRequest {
  fullName: string;
  userName: string;
  newPassword?: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
}

class UsersService extends BaseApiClient {
  async getAllUsers(): Promise<UserDto[]> {
    return this.get<UserDto[]>('/users');
  }

  async getUserById(id: number): Promise<UserDto> {
    return this.get<UserDto>(`/users/${id}`);
  }

  async createUser(data: CreateUserRequest): Promise<UserDto> {
    return this.post<UserDto, CreateUserRequest>('/users', data);
  }

  async updateUser(id: number, data: UpdateUserRequest): Promise<UserDto> {
    return this.put<UserDto, UpdateUserRequest>(`/users/${id}`, data);
  }

  async deleteUser(id: number): Promise<void> {
    return this.delete<void>(`/users/${id}`);
  }
}

export const usersService = new UsersService();
