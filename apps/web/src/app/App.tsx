import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from '../components/layout/Layout';
import Dashboard from '../features/dashboard/Dashboard';
import Entries from '../features/entries/Entries';
import Analytics from '../features/analytics/Analytics';
import Learning from '../features/learning-paths/Learning';
import Settings from '../features/settings/Settings';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/entries" element={<Entries />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/learning" element={<Learning />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
