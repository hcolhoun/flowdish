import './globals.css'
import NavBar from './components/NavBar'

export const metadata = {
  title: 'Flowdish',
  description: 'Kitchen operations system',
  icons: {
    icon: '/prawn.png',
    shortcut: '/prawn.png',
    apple: '/prawn.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50">
        <NavBar />
        <div className="min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}