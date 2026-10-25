import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nihongo Quest",
  description: "Không gian học tiếng Nhật cá nhân của bạn",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={plusJakartaSans.variable} suppressHydrationWarning>
      <body className={plusJakartaSans.className} suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

