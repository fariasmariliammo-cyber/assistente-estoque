import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { MessageSquare, Camera, LayoutDashboard } from 'lucide-react';
import { cn } from './lib/utils';
import Chat from './pages/Chat';
import Scanner from './pages/Scanner';
import Dashboard from './pages/Dashboard';

function BottomNav() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: MessageSquare, label: 'Assistente' },
    { path: '/vender', icon: Camera, label: 'Vender' },
    { path: '/painel', icon: LayoutDashboard, label: 'Painel' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isActive ? "text-emerald-600" : "text-gray-500 hover:text-gray-900"
              )}
            >
              <Icon className={cn("w-6 h-6", isActive && "fill-emerald-100")} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-gray-50 pb-16">
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/vender" element={<Scanner />} />
          <Route path="/painel" element={<Dashboard />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
