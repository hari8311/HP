import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProfileEditPage from './pages/ProfileEditPage';

export default function App() {
  return (
    <Routes>
      <Route path="/profile/edit" element={<ProfileEditPage />} />
      <Route path="*" element={<Navigate to="/profile/edit" replace />} />
    </Routes>
  );
}
