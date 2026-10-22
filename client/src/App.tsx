import { Navigate, Route, Routes } from 'react-router-dom';
import { Protected } from './auth';
import { Layout } from './Layout';
import { AuthPage, Landing } from './pages/AuthPages';
import { Dashboard, MySchedule } from './pages/SchedulePages';
import { Roster } from './pages/Roster';
import { AvailabilityPage } from './pages/Availability';
import { Team } from './pages/Team';
import { OpenShiftsPage, RequestsPage, TimeOffPage } from './pages/Requests';
import { AttendancePage } from './pages/Attendance';
import { TimesheetsPage } from './pages/Timesheets';
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage signup />} />
      <Route
        path="/app"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route
          path="roster"
          element={
            <Protected roles={['OWNER', 'MANAGER']}>
              <Roster />
            </Protected>
          }
        />
        <Route
          path="team"
          element={
            <Protected roles={['OWNER', 'MANAGER']}>
              <Team />
            </Protected>
          }
        />
        <Route path="schedule" element={<MySchedule />} />
        <Route path="availability" element={<AvailabilityPage />} />
        <Route path="time-off" element={<TimeOffPage />} />
        <Route path="open-shifts" element={<OpenShiftsPage />} />
        <Route
          path="requests"
          element={
            <Protected roles={['OWNER', 'MANAGER']}>
              <RequestsPage />
            </Protected>
          }
        />
        <Route
          path="attendance"
          element={
            <Protected roles={['OWNER', 'MANAGER']}>
              <AttendancePage />
            </Protected>
          }
        />
        <Route
          path="timesheets"
          element={
            <Protected roles={['OWNER', 'MANAGER']}>
              <TimesheetsPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
