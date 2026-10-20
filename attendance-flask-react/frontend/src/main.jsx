import React from 'react';
import { createRoot } from 'react-dom/client';
import AttendanceTracker from './AttendanceTracker.jsx';
import './style.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><AttendanceTracker /></React.StrictMode>
);
