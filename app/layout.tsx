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

const themeScript = `
  (function () {
    try {
      var savedTheme = localStorage.getItem('flowdish-theme');
      var theme = savedTheme === 'dark' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', theme === 'dark');
      document.documentElement.dataset.theme = theme;
    } catch (error) {
      document.documentElement.dataset.theme = 'light';
    }
  })();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <NavBar />
        <div className="min-h-screen">{children}</div>
      </body>
    </html>
  )
}
