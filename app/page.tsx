import { getSession } from '@/lib/auth';
import styles from './page.module.scss';
import HomeClient from './HomeClient';

// Server component — reads the session cookie server-side, passes data down
export default async function Home() {
  const session = await getSession();
  return (
    <div className={styles.page}>
      <HomeClient displayName={session?.displayName ?? session?.username} />
    </div>
  );
}
