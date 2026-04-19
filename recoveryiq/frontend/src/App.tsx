import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import NewSessionPage from './pages/NewSessionPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/new-session" element={<NewSessionPage />} />
      </Routes>
    </BrowserRouter>
  );
}
