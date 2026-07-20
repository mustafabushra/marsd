import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from '../../../src/modules/admin/admin.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestDataGenerator, mockPrismaService } from '../../fixtures/test-data';

describe('AdminService', () => {
  let service: AdminService;
  let prismaService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prismaService = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('getPendingReports', () => {
    it('should return paginated list of pending reports', async () => {
      const reports = [
        TestDataGenerator.createReport({ status: 'pending' }),
        TestDataGenerator.createReport({ status: 'pending' }),
      ];

      prismaService.report.findMany.mockResolvedValueOnce(reports);
      prismaService.report.count.mockResolvedValueOnce(2);

      const result = await service.getPendingReports(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        pages: 1,
      });
    });

    it('should apply pagination correctly', async () => {
      const reports = Array.from({ length: 10 }, () =>
        TestDataGenerator.createReport()
      );

      prismaService.report.findMany.mockResolvedValueOnce(reports.slice(0, 10));
      prismaService.report.count.mockResolvedValueOnce(30);

      const result = await service.getPendingReports(2, 10);

      expect(prismaService.report.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        include: {
          submittedByTenant: true,
          targetCompany: true,
        },
        skip: 10,
        take: 10,
      });
      expect(result.pagination.pages).toBe(3);
    });
  });

  describe('approveReport', () => {
    it('should approve a report and update status', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const adminUserId = TestDataGenerator.generateUUID();
      const report = TestDataGenerator.createReport({
        id: reportId,
        status: 'pending',
      });
      const approvedReport = { ...report, status: 'approved' };

      prismaService.report.findUnique.mockResolvedValueOnce(report);
      prismaService.report.update.mockResolvedValueOnce(approvedReport);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.approveReport(reportId, adminUserId);

      expect(result.status).toBe('approved');
      expect(prismaService.report.update).toHaveBeenCalled();
      expect(prismaService.auditLog.create).toHaveBeenCalled();
    });

    it('should throw error if report not found', async () => {
      const reportId = TestDataGenerator.generateUUID();

      prismaService.report.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.approveReport(reportId, TestDataGenerator.generateUUID())
      ).rejects.toThrow();
    });
  });

  describe('rejectReport', () => {
    it('should reject a report with reason', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const adminUserId = TestDataGenerator.generateUUID();
      const reason = 'Insufficient evidence';
      const report = TestDataGenerator.createReport({
        id: reportId,
        status: 'pending',
      });
      const rejectedReport = { ...report, status: 'rejected' };

      prismaService.report.findUnique.mockResolvedValueOnce(report);
      prismaService.report.update.mockResolvedValueOnce(rejectedReport);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.rejectReport(reportId, adminUserId, reason);

      expect(result.status).toBe('rejected');
      expect(prismaService.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: reportId },
          data: expect.objectContaining({ status: 'rejected' }),
        })
      );
    });
  });

  describe('getCompanies', () => {
    it('should return paginated companies list', async () => {
      const companies = [
        TestDataGenerator.createCompany(),
        TestDataGenerator.createCompany(),
      ];

      prismaService.company.findMany.mockResolvedValueOnce(companies);
      prismaService.company.count.mockResolvedValueOnce(2);

      const result = await service.getCompanies(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter by status', async () => {
      const companies = [
        TestDataGenerator.createCompany({ approved: true }),
      ];

      prismaService.company.findMany.mockResolvedValueOnce(companies);
      prismaService.company.count.mockResolvedValueOnce(1);

      await service.getCompanies(1, 20, 'approved');

      expect(prismaService.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
        })
      );
    });
  });

  describe('approveCompany', () => {
    it('should approve a company', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const adminUserId = TestDataGenerator.generateUUID();
      const company = TestDataGenerator.createCompany({
        id: companyId,
        approved: false,
      });
      const approvedCompany = { ...company, approved: true };

      prismaService.company.findUnique.mockResolvedValueOnce(company);
      prismaService.company.update.mockResolvedValueOnce(approvedCompany);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.approveCompany(companyId, adminUserId);

      expect(result.approved).toBe(true);
      expect(prismaService.company.update).toHaveBeenCalled();
    });
  });

  describe('getUsers', () => {
    it('should return paginated users list', async () => {
      const users = [
        await TestDataGenerator.createUser(),
        await TestDataGenerator.createUser(),
      ];

      prismaService.user.findMany.mockResolvedValueOnce(users);
      prismaService.user.count.mockResolvedValueOnce(2);

      const result = await service.getUsers(1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter by role', async () => {
      const users = [
        await TestDataGenerator.createUser({ role: 'platform_admin' }),
      ];

      prismaService.user.findMany.mockResolvedValueOnce(users);
      prismaService.user.count.mockResolvedValueOnce(1);

      await service.getUsers(1, 20, 'platform_admin');

      expect(prismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
        })
      );
    });
  });

  describe('updateUserStatus', () => {
    it('should update user status', async () => {
      const userId = TestDataGenerator.generateUUID();
      const adminUserId = TestDataGenerator.generateUUID();
      const newStatus = 'suspended';
      const user = await TestDataGenerator.createUser({
        id: userId,
        status: 'active',
      });
      const updatedUser = { ...user, status: newStatus };

      prismaService.user.findUnique.mockResolvedValueOnce(user);
      prismaService.user.update.mockResolvedValueOnce(updatedUser);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.updateUserStatus(userId, newStatus, adminUserId);

      expect(result.status).toBe(newStatus);
      expect(prismaService.user.update).toHaveBeenCalled();
    });
  });

  describe('getAuditLogs', () => {
    it('should return paginated audit logs', async () => {
      const logs = [
        TestDataGenerator.createAuditLog(),
        TestDataGenerator.createAuditLog(),
      ];

      prismaService.auditLog.findMany.mockResolvedValueOnce(logs);

      const result = await service.getAuditLogs(1, 20, {
        action: '',
        entity: '',
        startDate: '',
        endDate: '',
      });

      expect(result.data).toHaveLength(2);
    });

    it('should filter logs by action and date range', async () => {
      prismaService.auditLog.findMany.mockResolvedValueOnce([]);

      await service.getAuditLogs(1, 20, {
        action: 'admin:approve_report',
        entity: 'report',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(prismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
        })
      );
    });
  });

  describe('batchApproveReports', () => {
    it('should approve multiple reports', async () => {
      const reportIds = [
        TestDataGenerator.generateUUID(),
        TestDataGenerator.generateUUID(),
      ];
      const adminUserId = TestDataGenerator.generateUUID();

      prismaService.report.updateMany.mockResolvedValueOnce({ count: 2 });
      prismaService.auditLog.create.mockResolvedValue({});

      const result = await service.batchApproveReports(reportIds, adminUserId);

      expect(result.count).toBe(2);
      expect(prismaService.report.updateMany).toHaveBeenCalled();
    });
  });

  describe('bulkImportCompanies', () => {
    it('should bulk import companies', async () => {
      const companies = [
        {
          name: 'Company 1',
          crNumber: '1010111111',
          sector: 'Technology',
          city: 'Riyadh',
        },
        {
          name: 'Company 2',
          crNumber: '1010222222',
          sector: 'Finance',
          city: 'Jeddah',
        },
      ];
      const adminUserId = TestDataGenerator.generateUUID();

      prismaService.company.create.mockResolvedValue({});

      const result = await service.bulkImportCompanies(companies, adminUserId);

      expect(result.imported).toBe(2);
      expect(prismaService.company.create).toHaveBeenCalledTimes(2);
    });
  });
});
