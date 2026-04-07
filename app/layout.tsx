import type { Metadata } from 'next';
import '@/app/globals.scss';

export const metadata: Metadata = {
  title: 'Analytics AI — New World Group',
  description: 'Internal AI assistant for leads and traffic data across all client websites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
