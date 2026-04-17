import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PromptMaker',
  description: 'Chat con IA potenciado por Dify',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
