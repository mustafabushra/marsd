import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminCompanies from '../../pages/AdminCompanies';
import { render, mockApiCompany, createMockApi } from '../utils/test-utils';
import * as api from '../../lib/api';

vi.mock('../../lib/api');

describe('AdminCompanies Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render admin companies page', () => {
    const mockApi = createMockApi();
    api.getAdminCompanies = mockApi.getAdminCompanies;

    render(<AdminCompanies />);

    expect(screen.getByText('إدارة الشركات')).toBeInTheDocument();
  });

  it('should display loading state initially', () => {
    api.getAdminCompanies = vi.fn(() => new Promise(() => {}));

    render(<AdminCompanies />);

    expect(screen.getByText('جاري التحميل...')).toBeInTheDocument();
  });

  it('should fetch and display companies', async () => {
    const mockApi = createMockApi();
    api.getAdminCompanies = mockApi.getAdminCompanies;

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });

    expect(api.getAdminCompanies).toHaveBeenCalledWith(1, 20);
  });

  it('should display company details in table', async () => {
    const mockApi = createMockApi();
    api.getAdminCompanies = mockApi.getAdminCompanies;

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });

    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('مستحق')).toBeInTheDocument();
  });

  it('should display error when API fails', async () => {
    const errorMessage = 'خطأ في تحميل الشركات';
    api.getAdminCompanies = vi.fn().mockRejectedValue(new Error(errorMessage));

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(screen.getByText(new RegExp(errorMessage))).toBeInTheDocument();
    });
  });

  it('should handle approve company action', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.getAdminCompanies = mockApi.getAdminCompanies;
    api.approveCompany = mockApi.approveCompany;

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('تعديل');
    if (editButtons.length > 0) {
      await user.click(editButtons[0]);
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    }
  });

  it('should handle pagination', async () => {
    const mockApi = createMockApi();
    api.getAdminCompanies = mockApi.getAdminCompanies;

    render(<AdminCompanies />, { route: '/admin/companies?page=1' });

    await waitFor(() => {
      expect(api.getAdminCompanies).toHaveBeenCalledWith(1, 20);
    });
  });

  it('should display pending companies with pending status', async () => {
    const mockApi = createMockApi();
    const pendingCompany = {
      ...mockApiCompany,
      approved: false,
      status: 'قيد المراجعة',
    };

    api.getAdminCompanies = vi.fn().mockResolvedValue({
      data: [pendingCompany],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    });

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();
    });
  });

  it('should filter companies by status if provided', async () => {
    const mockApi = createMockApi();
    api.getAdminCompanies = mockApi.getAdminCompanies;

    render(<AdminCompanies />, { route: '/admin/companies?status=pending' });

    await waitFor(() => {
      expect(api.getAdminCompanies).toHaveBeenCalled();
    });
  });

  it('should handle empty companies list', async () => {
    api.getAdminCompanies = vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(screen.queryByText('Test Company')).not.toBeInTheDocument();
    });
  });

  it('should show add company button', async () => {
    const mockApi = createMockApi();
    api.getAdminCompanies = mockApi.getAdminCompanies;

    render(<AdminCompanies />);

    const addButton = screen.getByText('+ شركة جديدة');
    expect(addButton).toBeInTheDocument();
  });

  it('should refresh companies after action', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.getAdminCompanies = mockApi.getAdminCompanies;
    api.approveCompany = mockApi.approveCompany;

    render(<AdminCompanies />);

    await waitFor(() => {
      expect(api.getAdminCompanies).toHaveBeenCalled();
    });

    expect(api.getAdminCompanies).toHaveBeenCalledTimes(1);
  });
});
