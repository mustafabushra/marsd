import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '../utils/test-utils';
import * as api from '../../lib/api';

vi.mock('../../lib/api');

describe('Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Registration', () => {
    it('should display registration form', () => {
      render(<Login />);

      expect(screen.getByText(/تسجيل|Register/)).toBeInTheDocument();
    });

    it('should validate email format', async () => {
      const user = userEvent.setup();

      render(<Login />);

      const registerTab = screen.getByText(/تسجيل|Register/);
      await user.click(registerTab);

      const emailInput = screen.getByLabelText(/بريد|Email/);
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByText(/إرسال|Submit/);
      await user.click(submitButton);

      expect(screen.getByText(/صيغة البريد غير صحيحة|Invalid email/)).toBeInTheDocument();
    });

    it('should validate password strength', async () => {
      const user = userEvent.setup();

      render(<Login />);

      const registerTab = screen.getByText(/تسجيل|Register/);
      await user.click(registerTab);

      const passwordInput = screen.getByLabelText(/كلمة المرور|Password/);
      await user.type(passwordInput, '123');

      const submitButton = screen.getByText(/إرسال|Submit/);
      await user.click(submitButton);

      expect(screen.getByText(/كلمة المرور ضعيفة|Weak password/)).toBeInTheDocument();
    });

    it('should validate password confirmation', async () => {
      const user = userEvent.setup();

      render(<Login />);

      const registerTab = screen.getByText(/تسجيل|Register/);
      await user.click(registerTab);

      const passwordInput = screen.getByLabelText(/كلمة المرور(?![^)]*تأكيد)/);
      const confirmInput = screen.getByLabelText(/تأكيد كلمة المرور|Confirm/);

      await user.type(passwordInput, 'Test@1234');
      await user.type(confirmInput, 'Test@5678');

      const submitButton = screen.getByText(/إرسال|Submit/);
      await user.click(submitButton);

      expect(screen.getByText(/كلمات المرور غير متطابقة|Passwords don't match/)).toBeInTheDocument();
    });

    it('should register user successfully', async () => {
      const user = userEvent.setup();

      api.register = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@test.com' },
        accessToken: 'mock-token',
      });

      render(<Login />);

      const registerTab = screen.getByText(/تسجيل|Register/);
      await user.click(registerTab);

      const emailInput = screen.getByLabelText(/بريد|Email/);
      const passwordInput = screen.getByLabelText(/كلمة المرور(?![^)]*تأكيد)/);
      const confirmInput = screen.getByLabelText(/تأكيد كلمة المرور|Confirm/);

      await user.type(emailInput, 'test@test.com');
      await user.type(passwordInput, 'Test@1234');
      await user.type(confirmInput, 'Test@1234');

      const submitButton = screen.getByText(/إرسال|Submit/);
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.register).toHaveBeenCalled();
      });
    });
  });

  describe('Login', () => {
    it('should display login form', () => {
      render(<Login />);

      expect(screen.getByText(/دخول|Login/)).toBeInTheDocument();
    });

    it('should require email', async () => {
      const user = userEvent.setup();

      render(<Login />);

      const submitButton = screen.getByText(/دخول|Login/);
      await user.click(submitButton);

      expect(screen.getByText(/البريد مطلوب|Email required/)).toBeInTheDocument();
    });

    it('should require password', async () => {
      const user = userEvent.setup();

      render(<Login />);

      const emailInput = screen.getByLabelText(/بريد|Email/);
      await user.type(emailInput, 'test@test.com');

      const submitButton = screen.getByText(/دخول|Login/);
      await user.click(submitButton);

      expect(screen.getByText(/كلمة المرور مطلوبة|Password required/)).toBeInTheDocument();
    });

    it('should handle login with valid credentials', async () => {
      const user = userEvent.setup();

      api.login = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@test.com' },
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });

      render(<Login />);

      const emailInput = screen.getByLabelText(/بريد|Email/);
      const passwordInput = screen.getByLabelText(/كلمة المرور|Password/);

      await user.type(emailInput, 'test@test.com');
      await user.type(passwordInput, 'Test@1234');

      const submitButton = screen.getByText(/دخول|Login/);
      await user.click(submitButton);

      await waitFor(() => {
        expect(api.login).toHaveBeenCalledWith('test@test.com', 'Test@1234');
      });
    });

    it('should handle login error', async () => {
      const user = userEvent.setup();

      api.login = vi.fn().mockRejectedValue(new Error('Invalid credentials'));

      render(<Login />);

      const emailInput = screen.getByLabelText(/بريد|Email/);
      const passwordInput = screen.getByLabelText(/كلمة المرور|Password/);

      await user.type(emailInput, 'test@test.com');
      await user.type(passwordInput, 'wrong');

      const submitButton = screen.getByText(/دخول|Login/);
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/بيانات غير صحيحة|Invalid credentials/)).toBeInTheDocument();
      });
    });

    it('should store token after login', async () => {
      const user = userEvent.setup();
      const mockToken = 'mock-access-token';

      api.login = vi.fn().mockResolvedValue({
        user: { id: '1', email: 'test@test.com' },
        accessToken: mockToken,
        refreshToken: 'mock-refresh-token',
      });

      render(<Login />);

      const emailInput = screen.getByLabelText(/بريد|Email/);
      const passwordInput = screen.getByLabelText(/كلمة المرور|Password/);

      await user.type(emailInput, 'test@test.com');
      await user.type(passwordInput, 'Test@1234');

      const submitButton = screen.getByText(/دخول|Login/);
      await user.click(submitButton);

      await waitFor(() => {
        expect(localStorage.getItem('token')).toBe(mockToken);
      });
    });
  });

  describe('Logout', () => {
    it('should clear token on logout', async () => {
      const user = userEvent.setup();

      localStorage.setItem('token', 'mock-token');

      render(<Dashboard />);

      const logoutButton = screen.getByText(/تسجيل الخروج|Logout/);
      await user.click(logoutButton);

      expect(localStorage.getItem('token')).toBeNull();
    });
  });
});

// Mock components for testing
function Login() {
  return <div>Login Form</div>;
}

function Dashboard() {
  return <button>تسجيل الخروج</button>;
}
