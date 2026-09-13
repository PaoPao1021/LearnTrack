import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy } from 'react';
import Layout from '../components/layout/Layout';
import Dashboard from '../features/dashboard/Dashboard';

const Entries = lazy(() => import('../features/entries/Entries'));
const Analytics = lazy(() => import('../features/analytics/Analytics'));
const Learning = lazy(() => import('../features/learning-paths/Learning'));
const Settings = lazy(() => import('../features/settings/Settings'));

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
