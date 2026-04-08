import type { Metadata } from "next";
import localFont from "next/font/local";
import "@/app/globals.scss";

const helvetica = localFont({
  src: [
    {
      path: "../public/fonts/helvetica-roman.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/helvetica-bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-helvetica",
});

export const metadata: Metadata = {
  title: "NWG Atlas AI — New World Group",
  description:
    "Internal NWG AI assistant for leads and traffic data across all client websites.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={helvetica.variable}>
      <body>{children}</body>
    </html>
  );
}
