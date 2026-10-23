import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
export const metadata: Metadata = { title: "Nihongo Quest", description: "Không gian học tiếng Nhật cá nhân của bạn" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="vi"><body><AppShell>{children}</AppShell></body></html>; }
