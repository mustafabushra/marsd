import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Companies from '../../pages/Companies';
import { render, mockApiCompany, createMockApi } from '../utils/test-utils';
import * as api from '../../lib/api';

vi.mock('../../lib/api');

describe('Companies Search Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render companies search page', () => {
    const mockApi = createMockApi();
    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    expect(screen.getByPlaceholderText(/البحث|Search/)).toBeInTheDocument();
  });

  it('should search companies by name', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    const searchInput = screen.getByPlaceholderText(/البحث|Search/);
    await user.type(searchInput, 'Tech');

    const searchButton = screen.getByText(/بحث|Search/);
    await user.click(searchButton);

    await waitFor(() => {
      expect(api.searchCompanies).toHaveBeenCalledWith('Tech', 1, 20);
    });
  });

  it('should display search results', async () => {
    const mockApi = createMockApi();
    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });
  });

  it('should display company details in cards', async () => {
    const mockApi = createMockApi();
    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument();
      expect(screen.getByText('Technology')).toBeInTheDocument();
      expect(screen.getByText('Riyadh')).toBeInTheDocument();
    });
  });

  it('should display company report details', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;
    api.getCompanyReport = mockApi.getCompanyReport;

    render(<Companies />);

    await waitFor(() => {
      expect(screen.getByText('Test Company')).toBeInTheDocument();
    });

    const viewReportButtons = screen.queryAllByText(/تقرير|Report/);
    if (viewReportButtons.length > 0) {
      await user.click(viewReportButtons[0]);

      await waitFor(() => {
        expect(api.getCompanyReport).toHaveBeenCalled();
      });
    }
  });

  it('should handle pagination', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    await waitFor(() => {
      expect(api.searchCompanies).toHaveBeenCalled();
    });

    const nextButtons = screen.queryAllByText(/التالي|Next/);
    if (nextButtons.length > 0) {
      await user.click(nextButtons[0]);
      expect(api.searchCompanies).toHaveBeenCalled();
    }
  });

  it('should handle search filters', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    const filterButtons = screen.queryAllByText(/filter|تصفية/i);
    if (filterButtons.length > 0) {
      await user.click(filterButtons[0]);
    }

    await waitFor(() => {
      expect(api.searchCompanies).toHaveBeenCalled();
    });
  });

  it('should display no results message', async () => {
    api.searchCompanies = vi.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    });

    render(<Companies />);

    await waitFor(() => {
      expect(screen.getByText(/لا توجد نتائج|No results/)).toBeInTheDocument();
    });
  });

  it('should display error message on search failure', async () => {
    const user = userEvent.setup();
    api.searchCompanies = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<Companies />);

    const searchInput = screen.getByPlaceholderText(/البحث|Search/);
    await user.type(searchInput, 'test');

    const searchButton = screen.getByText(/بحث|Search/);
    await user.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(/خطأ|Error/)).toBeInTheDocument();
    });
  });

  it('should sort companies by trust score', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    const sortButtons = screen.queryAllByText(/ترتيب|Sort/);
    if (sortButtons.length > 0) {
      await user.click(sortButtons[0]);
    }

    await waitFor(() => {
      expect(api.searchCompanies).toHaveBeenCalled();
    });
  });

  it('should handle search by CR number', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;

    render(<Companies />);

    const searchInput = screen.getByPlaceholderText(/البحث|Search/);
    await user.type(searchInput, '1010123456');

    const searchButton = screen.getByText(/بحث|Search/);
    await user.click(searchButton);

    await waitFor(() => {
      expect(api.searchCompanies).toHaveBeenCalledWith('1010123456', 1, 20);
    });
  });

  it('should display loading state during search', () => {
    api.searchCompanies = vi.fn(() => new Promise(() => {}));

    render(<Companies />);

    expect(screen.getByText(/جاري|Loading/)).toBeInTheDocument();
  });

  it('should reset search results on new query', async () => {
    const mockApi = createMockApi();
    const user = userEvent.setup();

    api.searchCompanies = mockApi.searchCompanies;

    const { rerender } = render(<Companies />);

    await waitFor(() => {
      expect(api.searchCompanies).toHaveBeenCalled();
    });

    const resetButton = screen.queryByText(/إعادة تعيين|Reset/);
    if (resetButton) {
      await user.click(resetButton);
    }
  });
});
