import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { Terminal, Cpu, Settings, FolderGit2, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DevForge AI | Autonomous Developer Agent',
  description: 'AI-powered developer agent for codebase analysis, solution planning, targeted code modification, and real verification.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-container">
          <header className="top-header">
            <div className="brand-section">
              <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="brand-logo">
                  <Terminal size={20} />
                </div>
                <div className="brand-title">
                  DevForge <span className="badge-ai">AGENT ENGINE</span>
                </div>
              </Link>
            </div>

            <nav className="nav-links">
              <Link href="/" className="nav-link active">
                Dashboard
              </Link>
              <Link href="/#workspace" className="nav-link">
                Workspace
              </Link>
              <Link href="/settings" className="nav-link">
                Settings
              </Link>
            </nav>

            <div className="header-right">
              <div className="status-pill" title="System Engine Status">
                <span className="status-dot healthy"></span>
                <span>ENGINE: ONLINE</span>
              </div>
              <div className="status-pill" title="Git Integration">
                <FolderGit2 size={13} color="#38bdf8" />
                <span>GIT: READY</span>
              </div>
            </div>
          </header>

          <main className="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
