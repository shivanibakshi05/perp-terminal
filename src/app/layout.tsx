import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Perp Terminal — On-Chain Perpetuals",
  description:
    "A professional-grade perpetuals trading interface: live orderbook over WebSockets, on-chain margin and positions via ethers.js.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
