import type { ReactNode } from 'react'

export const metadata = {
  title: 'Fablab Controller',
  description: 'Internal project management tool',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
