import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom'
import { useState } from 'react'
import Home from './pages/Home'
import ToolPage from './pages/ToolPage'
import Sidebar from './components/Sidebar'
import ThemeToggle from './components/ThemeToggle'
import useTheme from './hooks/useTheme'
import './App.css'

function AppShell() {
  const [open, setOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const location = useLocation()

  return (
    <div className="app-shell">
      {open && (
        <div className="sidebar-overlay" onClick={() => setOpen(false)} />
      )}

      <div className={`sidebar-wrap${open ? ' sidebar-wrap--open' : ''}`}>
        <Sidebar
          currentPath={location.pathname}
          onNavigate={() => setOpen(false)}
          theme={theme}
          onToggleTheme={toggle}
        />
      </div>

      <div className="app-main">
        {/* Mobile-only top bar */}
        <header className="app-topbar">
          <button
            className="topbar-toggle"
            onClick={() => setOpen(v => !v)}
            aria-label="Toggle menu"
          >
            <span /><span /><span />
          </button>
          <Link to="/" className="topbar-brand">🔧 UTools</Link>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tools/:toolId" element={<ToolPage />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
