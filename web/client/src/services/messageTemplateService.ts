import { BaseApiClient } from './api/BaseApiClient';

export interface MessageTemplateEntry {
  id: number;
  name: string;
  content: string;
  createdAt: string | null;
  updatedAt: string | null;
}

class MessageTemplateService extends BaseApiClient {
  async getAll(): Promise<MessageTemplateEntry[]> {
    return this.get<MessageTemplateEntry[]>('/message-templates');
  }

  async create(name: string, content: string): Promise<MessageTemplateEntry> {
    return this.post<MessageTemplateEntry>('/message-templates', { name, content });
  }

  async update(id: number, name: string, content: string): Promise<MessageTemplateEntry> {
    return this.put<MessageTemplateEntry>(`/message-templates/${id}`, { name, content });
  }

  async remove(id: number): Promise<void> {
    return this.delete<void>(`/message-templates/${id}`);
  }
}

export const messageTemplateService = new MessageTemplateService();
