"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./Header.module.scss";

interface HeaderProps {
  onNewChat: () => void;
  displayName?: string | null;
}

export default function Header({ onNewChat, displayName }: HeaderProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div
          className={styles.logo}
          onClick={onNewChat}
          style={{ cursor: "pointer" }}
        >
          <Image
            src="/nwg_icon.svg"
            alt="New World Group"
            width={32}
            height={32}
            priority
          />
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>NWG Atlas</span>
          <span className={styles.brandSub}>New World Group</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.newChat}
          onClick={onNewChat}
          title="New conversation"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1v14M1 8h14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          New Chat
        </button>

        {displayName && (
          <div className={styles.user}>
            <span className={styles.username}>{displayName}</span>
            <button
              className={styles.logout}
              onClick={handleLogout}
              title="Sign out"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M6 2H2v11h4M10 10l3-2.5L10 5M5 7.5h8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
