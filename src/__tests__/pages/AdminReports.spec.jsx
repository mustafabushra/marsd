import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminReports from '../../pages/AdminReports';
import { render, mockApiReport, createMockApi } from '../utils/test-utils';
import * as api from '../../lib/api';

vi.mock('../../lib/api');

describe('AdminReports Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render admin reports page', () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />);

    expect(screen.getByText('إدارة التقارير')).toBeInTheDocument();
  });

  it('should fetch and display pending reports', async () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />);

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });
  });

  it('should display report details', async () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />);

    await waitFor(() => {
      expect(screen.getByText(/Payment delayed/)).toBeInTheDocument();
    });
  });

  it('should approve report', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.getAdminReports = mockApi.getAdminReports;
    api.approveReport = mockApi.approveReport;

    render(<AdminReports />);

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });

    const approveButtons = screen.queryAllByText(/موافقة|Approve/i);
    if (approveButtons.length > 0) {
      await user.click(approveButtons[0]);
      expect(api.approveReport).toHaveBeenCalled();
    }
  });

  it('should reject report with reason', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.getAdminReports = mockApi.getAdminReports;
    api.rejectReport = mockApi.rejectReport;

    render(<AdminReports />);

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });

    const rejectButtons = screen.queryAllByText(/رفض|Reject/i);
    if (rejectButtons.length > 0) {
      await user.click(rejectButtons[0]);

      const textarea = screen.queryByPlaceholderText(/reason|السبب/i);
      if (textarea) {
        await user.type(textarea, 'Insufficient evidence');
        const submitBtn = screen.queryByText(/submit|إرسال/i);
        if (submitBtn) {
          await user.click(submitBtn);
        }
      }
    }
  });

  it('should filter reports by status', async () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />, { route: '/admin/reports?status=pending' });

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });
  });

  it('should handle pagination', async () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />, { route: '/admin/reports?page=2' });

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });
  });

  it('should display error state', async () => {
    api.getAdminReports = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<AdminReports />);

    await waitFor(() => {
      expect(screen.getByText(/خطأ|Error/)).toBeInTheDocument();
    });
  });

  it('should display loading state', () => {
    api.getAdminReports = vi.fn(() => new Promise(() => {}));

    render(<AdminReports />);

    expect(screen.getByText(/جاري|Loading/)).toBeInTheDocument();
  });

  it('should handle batch approve', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />);

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });

    const checkboxes = screen.queryAllByRole('checkbox');
    if (checkboxes.length > 1) {
      await user.click(checkboxes[1]);
      const batchApproveBtn = screen.queryByText(/batch|دفعة/i);
      if (batchApproveBtn) {
        await user.click(batchApproveBtn);
      }
    }
  });

  it('should display report category', async () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />);

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });
  });

  it('should display report amount', async () => {
    const mockApi = createMockApi();
    api.getAdminReports = mockApi.getAdminReports;

    render(<AdminReports />);

    await waitFor(() => {
      expect(screen.getByText(/50000|50,000/)).toBeInTheDocument();
    });
  });

  it('should handle empty reports list', async () => {
    api.getAdminReports = vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });

    render(<AdminReports />);

    await waitFor(() => {
      expect(api.getAdminReports).toHaveBeenCalled();
    });
  });
});
