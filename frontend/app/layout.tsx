import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./powergrid.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://powergrid-esp32-monitor.bluebauer523244.chatgpt.site",
  ),
  openGraph: {
    title: "PowerGrid | Giám sát điện năng",
    description: "Giám sát thiết bị, điện năng và sự cố trong một không gian.",
    images: ["/og.png"],
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PowerGrid | Giám sát điện năng",
    description: "Giám sát thiết bị, điện năng và sự cố trong một không gian.",
    images: ["/og.png"],
  },
  title: "PowerGrid | Giám sát điện năng",
  description:
    "Giám sát hai tủ điện, dữ liệu thiết bị ESP32, điện năng tiêu thụ và lịch sử sự cố.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
