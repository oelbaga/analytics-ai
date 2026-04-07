'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '@/types';
import styles from './Message.module.scss';

interface MessageProps {
  message: ChatMessage;
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  if (message.isLoading) {
    return (
      <div className={`${styles.wrapper} ${styles.assistant}`}>
        <div className={styles.avatar}>AI</div>
        <div className={`${styles.bubble} ${styles.loading}`}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>
      </div>
    );
  }

  const bubbleClass = isUser
    ? styles.userBubble
    : message.isError
      ? styles.errorBubble
      : styles.assistantBubble;

  return (
    <div className={`${styles.wrapper} ${isUser ? styles.user : styles.assistant}`}>
      {!isUser && (
        <div className={`${styles.avatar} ${message.isError ? styles.errorAvatar : ''}`}>
          {message.isError ? '!' : 'AI'}
        </div>
      )}
      <div className={`${styles.bubble} ${bubbleClass}`}>
        {isUser ? (
          // User messages are plain text — no markdown needed
          <p className={styles.content}>{message.content}</p>
        ) : (
          // Assistant messages are rendered as markdown
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <span className={styles.time}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {isUser && <div className={`${styles.avatar} ${styles.userAvatar}`}>You</div>}
    </div>
  );
}
