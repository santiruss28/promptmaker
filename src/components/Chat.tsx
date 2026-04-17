'use client';

import { useState, useEffect, useCallback } from 'react';
import { DifyConfig, Message, PendingFile, DifyFilePayload } from '@/types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import ConfigModal from './ConfigModal';

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

function getUserId(): string {
  if (typeof window === 'undefined') return 'user';
  let id = localStorage.getItem('dify_user_id');
  if (!id) {
    id = generateId();
    localStorage.setItem('dify_user_id', id);
  }
  return id;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<DifyConfig>({ apiKey: '', baseUrl: 'https://api.dify.ai/v1' });
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('dify_config');
    if (saved) {
      try {
        setConfig(JSON.parse(saved));
      } catch {
        setShowConfig(true);
      }
    } else {
      const envKey = process.env.NEXT_PUBLIC_DIFY_API_KEY;
      const envUrl = process.env.NEXT_PUBLIC_DIFY_BASE_URL;
      if (envKey) {
        setConfig({ apiKey: envKey, baseUrl: envUrl || 'https://api.dify.ai/v1' });
      } else {
        setShowConfig(true);
      }
    }
  }, []);

  const saveConfig = (newConfig: DifyConfig) => {
    setConfig(newConfig);
    localStorage.setItem('dify_config', JSON.stringify(newConfig));
    setShowConfig(false);
  };

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user', getUserId());

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'x-api-key': config.apiKey,
        'x-base-url': config.baseUrl,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Error al subir el archivo');
    }

    const data = await res.json();
    return data.id as string;
  };

  const sendMessage = useCallback(
    async (text: string, pendingFiles: PendingFile[]) => {
      if (!config.apiKey) {
        setShowConfig(true);
        return;
      }

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: text,
        files: pendingFiles.map((f) => ({
          name: f.name,
          type: f.type,
          mimeType: f.mimeType,
          preview: f.preview,
        })),
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsLoading(true);

      try {
        const difyFiles: DifyFilePayload[] = await Promise.all(
          pendingFiles.map(async (f) => {
            const uploadId = await uploadFile(f.file);
            return {
              type: f.type,
              transfer_method: 'local_file' as const,
              upload_file_id: uploadId,
            };
          })
        );

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'x-base-url': config.baseUrl,
          },
          body: JSON.stringify({
            inputs: {},
            query: text,
            response_mode: 'streaming',
            conversation_id: conversationId || undefined,
            user: getUserId(),
            files: difyFiles,
          }),
        });

        if (!res.ok || !res.body) {
          const errText = await res.text();
          let errMsg = 'Error en la solicitud';
          try {
            errMsg = JSON.parse(errText).message || errMsg;
          } catch {}
          throw new Error(errMsg);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;

            try {
              const event = JSON.parse(raw);
              if (event.event === 'message' && event.answer) {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: last.content + event.answer },
                  ];
                });
              } else if (event.event === 'message_end') {
                if (event.conversation_id) setConversationId(event.conversation_id);
              } else if (event.event === 'error') {
                throw new Error(event.message || 'Error del servidor Dify');
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Ocurrió un error inesperado';
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return [
            ...prev.slice(0, -1),
            { ...last, content: errMsg, isStreaming: false, error: true },
          ];
        });
      } finally {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.isStreaming) {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        setIsLoading(false);
      }
    },
    [config, conversationId]
  );

  const startNewChat = () => {
    setMessages([]);
    setConversationId('');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-gray-900">PromptMaker</h1>
        </div>

        <div className="flex items-center gap-1">
          {conversationId && (
            <button
              onClick={startNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo chat
            </button>
          )}
          <button
            onClick={() => setShowConfig(true)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Configuración"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      <MessageList messages={messages} />
      <MessageInput onSend={sendMessage} isLoading={isLoading} />

      {showConfig && (
        <ConfigModal
          config={config}
          onSave={saveConfig}
          onClose={() => setShowConfig(false)}
          required={!config.apiKey}
        />
      )}
    </div>
  );
}
