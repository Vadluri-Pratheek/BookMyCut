import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RoleSelectionPage  from './pages/RoleSelectionPage';
import CustomerAuthPage   from './pages/CustomerAuthPage';
import BarberAuthPage     from './pages/BarberAuthPage';
import CustomerDashboard  from './pages/CustomerDashboard';
import BarberDashboard    from './pages/BarberDashboard';
import { getCustomerToken, getBarberToken } from './api/client';
import './index.css';
import './App.css';

/** Redirect to customer auth if no token is present */
const ProtectedCustomerRoute = ({ children }) => {
  return getCustomerToken() ? children : <Navigate to="/auth/customer" replace />;
};

/** Redirect to barber auth if no token is present */
const ProtectedBarberRoute = ({ children }) => {
  return getBarberToken() ? children : <Navigate to="/auth/barber" replace />;
};

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/"                 element={<RoleSelectionPage />} />
      <Route path="/auth/customer"    element={<CustomerAuthPage />} />
      <Route path="/auth/barber"      element={<BarberAuthPage />} />
      <Route path="/dashboard"        element={<ProtectedCustomerRoute><CustomerDashboard /></ProtectedCustomerRoute>} />
      <Route path="/barber/dashboard" element={<ProtectedBarberRoute><BarberDashboard /></ProtectedBarberRoute>} />
      <Route path="*"                 element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
