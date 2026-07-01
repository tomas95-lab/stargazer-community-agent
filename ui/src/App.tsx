import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TopicEditor from './pages/TopicEditor';
import History from './pages/History';
import Settings from './pages/Settings';

function Nav() {
  const link = (to: string, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <nav className="flex items-center gap-2 px-6 py-4 border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-50">
      <span className="text-lg font-bold text-indigo-400 mr-6">Daily Thread Bot</span>
      {link('/', 'Dashboard')}
      {link('/topics', 'Topics')}
      {link('/history', 'History')}
      {link('/settings', 'Settings')}
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/topics" element={<TopicEditor />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
