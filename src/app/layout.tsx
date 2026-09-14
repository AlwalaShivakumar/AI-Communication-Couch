import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/Navigation";

export const metadata: Metadata = {
  title: "AI Communication Coach",
  description: "Personal AI Communication Coach",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn("antialiased min-h-screen flex flex-col bg-gray-950 text-gray-100")}>
        <header className="border-b border-gray-800 bg-gray-950 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black font-bold">
              C
            </div>
            <h1 className="font-semibold text-lg tracking-tight">AI Coach</h1>
          </div>
          <Navigation />
        </header>
        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
