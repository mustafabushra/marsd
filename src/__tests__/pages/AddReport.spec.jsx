import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddReport from '../../pages/AddReport';
import { render, mockApiCompany, createMockApi } from '../utils/test-utils';
import * as api from '../../lib/api';

vi.mock('../../lib/api');

describe('AddReport Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('token', 'mock-token');
  });

  it('should render add report form', () => {
    render(<AddReport />);

    expect(screen.getByText(/إضافة تقرير|Add Report/)).toBeInTheDocument();
  });

  it('should have required form fields', () => {
    render(<AddReport />);

    expect(screen.getByLabelText(/اسم الشركة|Company Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/الفئة|Category/)).toBeInTheDocument();
    expect(screen.getByLabelText(/الوصف|Description/)).toBeInTheDocument();
    expect(screen.getByLabelText(/المبلغ|Amount/)).toBeInTheDocument();
  });

  it('should validate required fields', async () => {
    const user = userEvent.setup();

    render(<AddReport />);

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    expect(screen.getByText(/اسم الشركة مطلوب|Company name required/)).toBeInTheDocument();
  });

  it('should validate positive amount', async () => {
    const user = userEvent.setup();

    render(<AddReport />);

    const amountInput = screen.getByLabelText(/المبلغ|Amount/);
    await user.type(amountInput, '-1000');

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    expect(screen.getByText(/المبلغ يجب أن يكون موجب|Amount must be positive/)).toBeInTheDocument();
  });

  it('should validate occurrence date is not in future', async () => {
    const user = userEvent.setup();

    render(<AddReport />);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);

    const dateInput = screen.getByLabelText(/تاريخ الحدث|Occurrence Date/);
    await user.type(dateInput, futureDate.toISOString().split('T')[0]);

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    expect(screen.getByText(/التاريخ لا يمكن أن يكون في المستقبل|Date cannot be in future/)).toBeInTheDocument();
  });

  it('should submit valid report form', async () => {
    const user = userEvent.setup();
    const mockApi = createMockApi();

    api.submitReport = mockApi.submitReport;

    render(<AddReport />);

    const companyInput = screen.getByLabelText(/اسم الشركة|Company Name/);
    const categorySelect = screen.getByLabelText(/الفئة|Category/);
    const descriptionInput = screen.getByLabelText(/الوصف|Description/);
    const amountInput = screen.getByLabelText(/المبلغ|Amount/);

    await user.type(companyInput, 'Test Company');
    await user.selectOptions(categorySelect, 'payment_delay');
    await user.type(descriptionInput, 'Payment was delayed');
    await user.type(amountInput, '50000');

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    await waitFor(() => {
      expect(api.submitReport).toHaveBeenCalled();
    });
  });

  it('should show success message after submission', async () => {
    const user = userEvent.setup();
    const mockApi = createMockApi();

    api.submitReport = mockApi.submitReport;

    render(<AddReport />);

    const companyInput = screen.getByLabelText(/اسم الشركة|Company Name/);
    const categorySelect = screen.getByLabelText(/الفئة|Category/);
    const descriptionInput = screen.getByLabelText(/الوصف|Description/);
    const amountInput = screen.getByLabelText(/المبلغ|Amount/);

    await user.type(companyInput, 'Test Company');
    await user.selectOptions(categorySelect, 'payment_delay');
    await user.type(descriptionInput, 'Payment was delayed');
    await user.type(amountInput, '50000');

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/تم إرسال التقرير|Report submitted/)).toBeInTheDocument();
    });
  });

  it('should handle submission error', async () => {
    const user = userEvent.setup();

    api.submitReport = vi.fn().mockRejectedValue(new Error('Server error'));

    render(<AddReport />);

    const companyInput = screen.getByLabelText(/اسم الشركة|Company Name/);
    const categorySelect = screen.getByLabelText(/الفئة|Category/);
    const descriptionInput = screen.getByLabelText(/الوصف|Description/);
    const amountInput = screen.getByLabelText(/المبلغ|Amount/);

    await user.type(companyInput, 'Test Company');
    await user.selectOptions(categorySelect, 'payment_delay');
    await user.type(descriptionInput, 'Payment was delayed');
    await user.type(amountInput, '50000');

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/خطأ|Error/)).toBeInTheDocument();
    });
  });

  it('should clear form after successful submission', async () => {
    const user = userEvent.setup();
    const mockApi = createMockApi();

    api.submitReport = mockApi.submitReport;

    render(<AddReport />);

    const companyInput = screen.getByLabelText(/اسم الشركة|Company Name/);
    const categorySelect = screen.getByLabelText(/الفئة|Category/);
    const descriptionInput = screen.getByLabelText(/الوصف|Description/);
    const amountInput = screen.getByLabelText(/المبلغ|Amount/);

    await user.type(companyInput, 'Test Company');
    await user.selectOptions(categorySelect, 'payment_delay');
    await user.type(descriptionInput, 'Payment was delayed');
    await user.type(amountInput, '50000');

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    await waitFor(() => {
      expect(companyInput.value).toBe('');
      expect(descriptionInput.value).toBe('');
      expect(amountInput.value).toBe('');
    });
  });

  it('should validate description length', async () => {
    const user = userEvent.setup();

    render(<AddReport />);

    const descriptionInput = screen.getByLabelText(/الوصف|Description/);
    const longText = 'a'.repeat(5001); // Exceeds max length

    await user.type(descriptionInput, longText);

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    expect(screen.getByText(/الوصف طويل جدا|Description too long/)).toBeInTheDocument();
  });

  it('should display all report categories', () => {
    render(<AddReport />);

    const categorySelect = screen.getByLabelText(/الفئة|Category/);

    expect(categorySelect).toBeInTheDocument();
    const options = categorySelect.querySelectorAll('option');
    expect(options.length).toBeGreaterThan(1);
  });

  it('should disable submit button while loading', async () => {
    const user = userEvent.setup();

    api.submitReport = vi.fn(() => new Promise(() => {})); // Never resolves

    render(<AddReport />);

    const companyInput = screen.getByLabelText(/اسم الشركة|Company Name/);
    const categorySelect = screen.getByLabelText(/الفئة|Category/);
    const descriptionInput = screen.getByLabelText(/الوصف|Description/);
    const amountInput = screen.getByLabelText(/المبلغ|Amount/);

    await user.type(companyInput, 'Test Company');
    await user.selectOptions(categorySelect, 'payment_delay');
    await user.type(descriptionInput, 'Payment was delayed');
    await user.type(amountInput, '50000');

    const submitButton = screen.getByText(/إرسال|Submit/);
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
  });
});
