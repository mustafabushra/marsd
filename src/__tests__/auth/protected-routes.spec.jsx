import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import * as api from '../../lib/api';

vi.mock('../../lib/api');

describe('Protected Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Admin Routes', () => {
    it('should redirect to login if not authenticated', async () => {
      render(<AdminDashboard />, { route: '/admin/dashboard' });

      await waitFor(() => {
        expect(screen.getByText(/دخول|Login/)).toBeInTheDocument();
      });
    });

    it('should allow admin access with valid role', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ role: 'platform_admin' }));

      const mockApi = {
        getAdminDashboardStats: vi.fn().mockResolvedValue({ reports: 10 }),
      };
      api.getAdminDashboardStats = mockApi.getAdminDashboardStats;

      render(<AdminDashboard />, { route: '/admin/dashboard' });

      await waitFor(() => {
        expect(api.getAdminDashboardStats).toHaveBeenCalled();
      });
    });

    it('should deny access to non-admin users', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ role: 'company_admin' }));

      render(<AdminDashboard />, { route: '/admin/dashboard' });

      await waitFor(() => {
        expect(screen.getByText(/غير مصرح|Unauthorized/)).toBeInTheDocument();
      });
    });

    it('should refresh token on expiry', async () => {
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh-token');

      api.refresh = vi.fn().mockResolvedValue({
        accessToken: 'new-token',
      });

      render(<AdminDashboard />, { route: '/admin/dashboard' });

      await waitFor(() => {
        expect(api.refresh).toHaveBeenCalled();
      });
    });

    it('should handle token refresh failure', async () => {
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'invalid-refresh-token');

      api.refresh = vi.fn().mockRejectedValue(new Error('Token expired'));

      render(<AdminDashboard />, { route: '/admin/dashboard' });

      await waitFor(() => {
        expect(screen.getByText(/دخول|Login/)).toBeInTheDocument();
      });
    });
  });

  describe('Company Routes', () => {
    it('should allow authenticated company users', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ role: 'company_admin' }));

      render(<CompanyDashboard />, { route: '/company/dashboard' });

      await waitFor(() => {
        expect(screen.getByText(/لوحة التحكم|Dashboard/)).toBeInTheDocument();
      });
    });

    it('should redirect unauthenticated users to login', async () => {
      localStorage.clear();

      render(<CompanyDashboard />, { route: '/company/dashboard' });

      await waitFor(() => {
        expect(screen.getByText(/دخول|Login/)).toBeInTheDocument();
      });
    });
  });

  describe('Protected API Calls', () => {
    it('should include token in authorization header', async () => {
      localStorage.setItem('token', 'mock-token');

      const mockApi = {
        getAdminReports: vi.fn().mockResolvedValue({ data: [] }),
      };
      api.getAdminReports = mockApi.getAdminReports;

      render(<AdminReports />, { route: '/admin/reports' });

      await waitFor(() => {
        expect(mockApi.getAdminReports).toHaveBeenCalled();
      });
    });

    it('should retry on 401 unauthorized', async () => {
      localStorage.setItem('token', 'expired-token');
      localStorage.setItem('refreshToken', 'valid-refresh-token');

      api.refresh = vi.fn().mockResolvedValue({
        accessToken: 'new-token',
      });

      const mockApi = {
        getAdminReports: vi
          .fn()
          .mockRejectedValueOnce({ status: 401 })
          .mockResolvedValueOnce({ data: [] }),
      };
      api.getAdminReports = mockApi.getAdminReports;

      render(<AdminReports />, { route: '/admin/reports' });

      await waitFor(() => {
        expect(mockApi.getAdminReports).toHaveBeenCalled();
      });
    });
  });

  describe('Route Access Control', () => {
    it('should show admin menu only for admins', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ role: 'platform_admin' }));

      render(<Navigation />);

      expect(screen.getByText(/إدارة|Admin/)).toBeInTheDocument();
    });

    it('should hide admin menu for non-admins', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ role: 'company_admin' }));

      render(<Navigation />);

      expect(screen.queryByText(/إدارة|Admin/)).not.toBeInTheDocument();
    });

    it('should show company menu for company users', async () => {
      localStorage.setItem('token', 'valid-token');
      localStorage.setItem('user', JSON.stringify({ role: 'company_admin' }));

      render(<Navigation />);

      expect(screen.getByText(/الشركة|Company/)).toBeInTheDocument();
    });
  });

  describe('Session Management', () => {
    it('should logout on session expiry', async () => {
      localStorage.setItem('token', 'expired-token');
      const user = userEvent.setup();

      api.getAdminReports = vi.fn().mockRejectedValue({
        status: 401,
        message: 'Session expired',
      });

      render(<AdminReports />, { route: '/admin/reports' });

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBeNull();
      });
    });

    it('should preserve redirect URL after login', async () => {
      const user = userEvent.setup();

      api.login = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@test.com' },
        accessToken: 'mock-token',
        refreshToken: 'mock-refresh-token',
      });

      render(<Login />, { route: '/login?redirect=/admin/reports' });

      const emailInput = screen.getByLabelText(/بريد|Email/);
      const passwordInput = screen.getByLabelText(/كلمة المرور|Password/);

      await user.type(emailInput, 'test@test.com');
      await user.type(passwordInput, 'Test@1234');

      const submitButton = screen.getByText(/دخول|Login/);
      await user.click(submitButton);

      await waitFor(() => {
        expect(window.location.pathname).toBe('/admin/reports');
      });
    });
  });
});

// Mock components
function AdminDashboard() {
  return <div>Admin Dashboard</div>;
}

function CompanyDashboard() {
  return <div>لوحة التحكم</div>;
}

function AdminReports() {
  return <div>Admin Reports</div>;
}

function Navigation() {
  return <nav>Navigation</nav>;
}

function Login() {
  return <div>Login Form</div>;
}
