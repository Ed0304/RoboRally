import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "../../components/header";
import Footer from "../../components/footer";
import AuthWrapper from "../../components/AuthProvider";
import { Orbitron } from "next/font/google";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RoboRally",
  description: "Created as a hackathon entry",
};

const orbitron = Orbitron({
  variable: "--orbitron-font",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export default function RootLayout({ children }: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className={`${orbitron.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthWrapper>
        <Suspense fallback={null}>
          <Header />
        </Suspense>
        {children}
        <Footer/>
        </AuthWrapper>
      </body>
    </html>
  );
}
