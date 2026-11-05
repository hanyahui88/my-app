import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "哄哄模拟器 | 十轮之内哄好 TA",
  description: "AI 情侣互动游戏，选择你的回应，在十轮之内让 TA 消消气。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
