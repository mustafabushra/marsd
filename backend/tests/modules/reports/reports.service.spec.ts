import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from '../../../src/modules/reports/reports.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TrustScoreService } from '../../../src/modules/trust-score/trust-score.service';
import { TestDataGenerator, mockPrismaService } from '../../fixtures/test-data';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaService: any;
  let trustScoreService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: TrustScoreService,
          useValue: {
            updateScore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    prismaService = module.get(PrismaService);
    trustScoreService = module.get(TrustScoreService);

    jest.clearAllMocks();
  });

  describe('submitReport', () => {
    it('should submit a new report', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const companyId = TestDataGenerator.generateUUID();
      const reportDto = TestDataGenerator.createReportDto();
      const company = TestDataGenerator.createCompany({
        id: companyId,
        crNumber: reportDto.targetCompanyCrNumber,
      });
      const report = TestDataGenerator.createReport({
        submittedByTenantId: tenantId,
        targetCompanyId: companyId,
        status: 'pending',
      });

      prismaService.company.findUnique.mockResolvedValueOnce(company);
      prismaService.report.create.mockResolvedValueOnce(report);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.submitReport(tenantId, reportDto);

      expect(result.status).toBe('pending');
      expect(result.submittedByTenantId).toBe(tenantId);
      expect(prismaService.report.create).toHaveBeenCalled();
    });

    it('should throw error for non-existent company', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const reportDto = TestDataGenerator.createReportDto();

      prismaService.company.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.submitReport(tenantId, reportDto)
      ).rejects.toThrow();
    });

    it('should validate report amount is positive', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const reportDto = {
        ...TestDataGenerator.createReportDto(),
        amount: -1000,
      };

      await expect(
        service.submitReport(tenantId, reportDto)
      ).rejects.toThrow();
    });

    it('should validate occurrence date is not in future', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const reportDto = {
        ...TestDataGenerator.createReportDto(),
        occurrenceDate: futureDate,
      };

      await expect(
        service.submitReport(tenantId, reportDto)
      ).rejects.toThrow();
    });
  });

  describe('getUserReports', () => {
    it('should return user submitted reports', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const reports = [
        TestDataGenerator.createReport({ submittedByTenantId: tenantId }),
        TestDataGenerator.createReport({ submittedByTenantId: tenantId }),
      ];

      prismaService.report.findMany.mockResolvedValueOnce(reports);
      prismaService.report.count.mockResolvedValueOnce(2);

      const result = await service.getUserReports(tenantId, 1, 20);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter by status', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const reports = [
        TestDataGenerator.createReport({
          submittedByTenantId: tenantId,
          status: 'approved',
        }),
      ];

      prismaService.report.findMany.mockResolvedValueOnce(reports);
      prismaService.report.count.mockResolvedValueOnce(1);

      await service.getUserReports(tenantId, 1, 20, 'approved');

      expect(prismaService.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'approved',
          }),
        })
      );
    });
  });

  describe('getCompanyReports', () => {
    it('should return reports about a company', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const reports = [
        TestDataGenerator.createReport({ targetCompanyId: companyId, status: 'approved' }),
        TestDataGenerator.createReport({ targetCompanyId: companyId, status: 'approved' }),
      ];

      prismaService.report.findMany.mockResolvedValueOnce(reports);
      prismaService.report.count.mockResolvedValueOnce(2);

      const result = await service.getCompanyReports(companyId, 1, 20);

      expect(result.data).toHaveLength(2);
    });

    it('should only return approved reports', async () => {
      const companyId = TestDataGenerator.generateUUID();
      prismaService.report.findMany.mockResolvedValueOnce([]);

      await service.getCompanyReports(companyId, 1, 20);

      expect(prismaService.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'approved',
          }),
        })
      );
    });
  });

  describe('editReport', () => {
    it('should edit pending report', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const report = TestDataGenerator.createReport({
        id: reportId,
        submittedByTenantId: tenantId,
        status: 'pending',
      });
      const updateData = { description: 'Updated description' };
      const updatedReport = { ...report, ...updateData };

      prismaService.report.findUnique.mockResolvedValueOnce(report);
      prismaService.report.update.mockResolvedValueOnce(updatedReport);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.editReport(reportId, tenantId, updateData);

      expect(result.description).toBe(updateData.description);
    });

    it('should throw error if report not pending', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const report = TestDataGenerator.createReport({
        id: reportId,
        status: 'approved',
      });

      prismaService.report.findUnique.mockResolvedValueOnce(report);

      await expect(
        service.editReport(reportId, tenantId, {})
      ).rejects.toThrow();
    });

    it('should throw error if not report owner', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const report = TestDataGenerator.createReport({
        id: reportId,
        submittedByTenantId: TestDataGenerator.generateUUID(),
      });

      prismaService.report.findUnique.mockResolvedValueOnce(report);

      await expect(
        service.editReport(reportId, TestDataGenerator.generateUUID(), {})
      ).rejects.toThrow();
    });
  });

  describe('deleteReport', () => {
    it('should delete pending report', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const report = TestDataGenerator.createReport({
        id: reportId,
        submittedByTenantId: tenantId,
        status: 'pending',
      });

      prismaService.report.findUnique.mockResolvedValueOnce(report);
      prismaService.report.delete.mockResolvedValueOnce(report);
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.deleteReport(reportId, tenantId);

      expect(result.id).toBe(reportId);
    });

    it('should not allow deleting approved reports', async () => {
      const reportId = TestDataGenerator.generateUUID();
      const report = TestDataGenerator.createReport({
        id: reportId,
        status: 'approved',
      });

      prismaService.report.findUnique.mockResolvedValueOnce(report);

      await expect(
        service.deleteReport(reportId, TestDataGenerator.generateUUID())
      ).rejects.toThrow();
    });
  });

  describe('getReportStats', () => {
    it('should return report statistics', async () => {
      const companyId = TestDataGenerator.generateUUID();

      prismaService.report.count.mockResolvedValueOnce(10); // total
      prismaService.report.count.mockResolvedValueOnce(8); // approved
      prismaService.report.count.mockResolvedValueOnce(1); // pending
      prismaService.report.count.mockResolvedValueOnce(1); // rejected

      const result = await service.getReportStats(companyId);

      expect(result.total).toBe(10);
      expect(result.approved).toBe(8);
      expect(result.pending).toBe(1);
      expect(result.rejected).toBe(1);
    });
  });
});
