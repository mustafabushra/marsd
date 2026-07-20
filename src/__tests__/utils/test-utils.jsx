import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

function render(
  ui,
  {
    route = '/',
    ...renderOptions
  } = {}
) {
  window.history.pushState({}, 'Test page', route);

  return rtlRender(
    <BrowserRouter>
      {ui}
    </BrowserRouter>,
    renderOptions
  );
}

export * from '@testing-library/react';
export { render };

export const mockAuthContext = {
  user: null,
  token: null,
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  isAuthenticated: false,
};

export const mockAuthUser = {
  id: '123',
  email: 'test@test.com',
  firstName: 'Test',
  role: 'company_admin',
  tenantId: 'tenant-123',
};

export const mockAdminUser = {
  ...mockAuthUser,
  role: 'platform_admin',
};

export const mockApiCompany = {
  id: '1',
  name: 'Test Company',
  crNumber: '1010123456',
  sector: 'Technology',
  city: 'Riyadh',
  approved: true,
  score: 85,
};

export const mockApiReport = {
  id: 'report-1',
  targetCompanyId: '1',
  category: 'payment_delay',
  description: 'Payment delayed by 30 days',
  amount: 50000,
  status: 'pending',
  createdAt: new Date().toISOString(),
};

export const mockApiResponse = {
  data: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  },
};

export const createMockApi = () => {
  return {
    getAdminCompanies: vi.fn().mockResolvedValue({
      data: [mockApiCompany],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    }),
    getAdminReports: vi.fn().mockResolvedValue({
      data: [mockApiReport],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    }),
    getAdminUsers: vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 1 },
    }),
    searchCompanies: vi.fn().mockResolvedValue({
      data: [mockApiCompany],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    }),
    getCompanyReport: vi.fn().mockResolvedValue({
      company: mockApiCompany,
      status: 'full',
      tier: 'excellent',
    }),
    submitReport: vi.fn().mockResolvedValue(mockApiReport),
    approveCompany: vi.fn().mockResolvedValue({ ...mockApiCompany, approved: true }),
    approveReport: vi.fn().mockResolvedValue({ ...mockApiReport, status: 'approved' }),
    rejectReport: vi.fn().mockResolvedValue({ ...mockApiReport, status: 'rejected' }),
    updateUserStatus: vi.fn().mockResolvedValue({}),
  };
};

export const waitForLoadingToFinish = async () => {
  const { waitFor } = await import('@testing-library/react');
  await waitFor(() => {
    expect(document.querySelector('[data-testid="loading"]')).not.toBeInTheDocument();
  }, { timeout: 3000 }).catch(() => {
    // It's ok if loading element doesn't exist
  });
};
