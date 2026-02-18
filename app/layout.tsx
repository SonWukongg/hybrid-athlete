import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import './globals.css'

// Syne — geometric display font for headings and the brand wordmark
const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['400','600','700','800'] })
// DM Sans — clean, legible body font
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', weight: ['300','400','500','600'] })

export const metadata: Metadata = {
  title: 'Hybrid Athlete',
  description: 'AI-powered training for hybrid athletes',
}

// Root layout — applies fonts and ink-black base to every page
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${dmSans.variable} font-sans bg-ink-black-950 text-ink-black-100 antialiased`}>
        {children}
      </body>
    </html>
  )
}
