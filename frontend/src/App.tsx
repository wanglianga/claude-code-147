import { Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './api';
import Login from './pages/Login';
import Layout from './pages/Layout';
import Dashboard from './pages/Dashboard';
import Availability from './pages/Availability';
import Bookings from './pages/Bookings';
import BookingDetail from './pages/BookingDetail';
import Housekeeping from './pages/Housekeeping';
import Kitchen from './pages/Kitchen';
import Maintenance from './pages/Maintenance';
import Incidents from './pages/Incidents';
import Reviews from './pages/Reviews';
import Billing from './pages/Billing';
import Analytics from './pages/Analytics';

function Private({ children }: { children: JSX.Element }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="availability" element={<Availability />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="housekeeping" element={<Housekeeping />} />
        <Route path="kitchen" element={<Kitchen />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="incidents" element={<Incidents />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="billing" element={<Billing />} />
        <Route path="analytics" element={<Analytics />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
