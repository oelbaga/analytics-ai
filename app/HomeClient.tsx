'use client';

import Header from '@/components/Header/Header';
import Chat from '@/components/Chat/Chat';
import styles from './page.module.scss';

interface HomeClientProps {
  displayName?: string | null;
}

export default function HomeClient({ displayName }: HomeClientProps) {
  const handleNewChat = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__chatReset?.();
  };

  return (
    <>
      <Header onNewChat={handleNewChat} displayName={displayName} />
      <main className={styles.main}>
        <Chat />
      </main>
    </>
  );
}
