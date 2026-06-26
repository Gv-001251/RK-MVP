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
  title: "RK Clinic - Healthcare Management Dashboard",
  description: "Premium Healthcare Management System Dashboard",
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

