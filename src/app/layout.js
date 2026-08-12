import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClinicProvider } from "../context/ClinicContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "RK Clinic - Laboratory Workflow & Reporting System",
  description: "Laboratory Workflow & Reporting System for RK Clinic — digital test ordering, sample tracking, result entry, verification and report delivery.",
};

/**
 * Stated explicitly rather than relying on the framework default.
 *
 * Without `width=device-width` a phone renders the page at a notional desktop
 * width and scales it down, so every table and control arrives too small to read
 * or tap. Next does inject a sensible default, but this is load-bearing for
 * mobile and worth being able to see in the source.
 *
 * `maximumScale` is deliberately absent: blocking pinch-zoom on a clinical app
 * would stop someone enlarging a result value they need to read precisely, and
 * it fails WCAG 1.4.4.
 */
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClinicProvider>
          {children}
        </ClinicProvider>
      </body>
    </html>
  );
}

