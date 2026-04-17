export interface DifyConfig {
  apiKey: string;
  baseUrl: string;
}

export interface PendingFile {
  id: string;
  name: string;
  type: 'image' | 'document';
  mimeType: string;
  size: number;
  preview?: string;
  file: File;
}

export interface MessageFile {
  name: string;
  type: 'image' | 'document';
  mimeType: string;
  preview?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: MessageFile[];
  timestamp: Date;
  isStreaming?: boolean;
  error?: boolean;
}

export interface DifyFilePayload {
  type: 'image' | 'document';
  transfer_method: 'local_file';
  upload_file_id: string;
}
