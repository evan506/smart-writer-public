import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Writer — 웹소설 작가 보조 도구",
  description: "웹소설 연재 시 세계관, 캐릭터, 복선의 일관성을 관리하는 작가 보조 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
