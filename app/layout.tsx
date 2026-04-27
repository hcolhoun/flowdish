import './globals.css'
import NavBar from './components/NavBar'

export const metadata = {
  title: 'Kitchen Cloud',
  description: 'Kitchen operations system',
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