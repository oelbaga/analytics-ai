'use client';

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import Message from '@/components/Message/Message';
import Suggestions from '@/components/Suggestions/Suggestions';
import type { ChatMessage, ApiChatResponse } from '@/types';
import styles from './Chat.module.scss';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    const loadingMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, conversationId }),
      });

      const data: ApiChatResponse & { error?: string } = await res.json();

      if (!res.ok) {
        // Surface the server's error message directly — no generic wrapper
        const errorContent = data.error ?? 'Something went wrong. Please try again.';
        setMessages((prev) => [
          ...prev.slice(0, -1),
          {
            id: generateId(),
            role: 'assistant' as const,
            content: errorContent,
            timestamp: new Date().toISOString(),
            isError: true,
          },
        ]);
        return;
      }

      // Store conversation ID from first response
      if (!conversationId) setConversationId(data.conversationId);

      const assistantMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date().toISOString(),
      };

      // Replace loading bubble with real message
      setMessages((prev) => [...prev.slice(0, -1), assistantMsg]);
    } catch {
      // Network-level failure (no response at all)
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          id: generateId(),
          role: 'assistant' as const,
          content: 'Could not reach the server. Please check your connection and try again.',
          timestamp: new Date().toISOString(),
          isError: true,
        },
      ]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [isLoading, conversationId]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Exposed to parent (page) for "New Chat" reset
  const reset = useCallback(() => {
    setMessages([]);
    setInput('');
    setConversationId(undefined);
    setIsLoading(false);
    textareaRef.current?.focus();
  }, []);

  // Attach reset to window so Header can call it
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__chatReset = reset;
    return () => { delete (window as any).__chatReset; };
  }, [reset]);

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.container}>
      {/* Message area */}
      <div className={styles.messages}>
        {isEmpty ? (
          <Suggestions onSelect={(t) => sendMessage(t)} />
        ) : (
          <div className={styles.messageList}>
            {messages.map((msg) => (
              <Message key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className={styles.inputBar}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about leads or traffic for any client…"
            rows={1}
            disabled={isLoading}
          />
          <button
            className={styles.sendBtn}
            type="submit"
            disabled={!input.trim() || isLoading}
            title="Send (Enter)"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M15.5 9L2.5 2.5L6 9L2.5 15.5L15.5 9Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </form>
        <p className={styles.hint}>
          Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}
