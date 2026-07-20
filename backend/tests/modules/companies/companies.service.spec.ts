import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesService } from '../../../src/modules/companies/companies.service';
import { TrustScoreService } from '../../../src/modules/trust-score/trust-score.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { TestDataGenerator, mockPrismaService } from '../../fixtures/test-data';

describe('CompaniesService', () => {
  let service: CompaniesService;
  let prismaService: any;
  let trustScoreService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: TrustScoreService,
          useValue: {
            calculateScore: jest.fn(),
            updateScore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
    prismaService = module.get(PrismaService);
    trustScoreService = module.get(TrustScoreService);

    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should search companies by name', async () => {
      const companies = [
        TestDataGenerator.createCompany({ name: 'Tech Company', approved: true }),
      ];

      prismaService.company.findMany.mockResolvedValueOnce(companies);
      prismaService.company.count.mockResolvedValueOnce(1);

      const result = await service.search('Tech', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(1);
      expect(prismaService.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            approved: true,
          }),
        })
      );
    });

    it('should search by CR number', async () => {
      const companies = [
        TestDataGenerator.createCompany({ crNumber: '1010123456' }),
      ];

      prismaService.company.findMany.mockResolvedValueOnce(companies);
      prismaService.company.count.mockResolvedValueOnce(1);

      const result = await service.search('1010123456', 1, 20);

      expect(result.data).toHaveLength(1);
    });

    it('should apply pagination correctly', async () => {
      const companies = Array.from({ length: 10 }, () =>
        TestDataGenerator.createCompany()
      );

      prismaService.company.findMany.mockResolvedValueOnce(companies);
      prismaService.company.count.mockResolvedValueOnce(50);

      const result = await service.search('test', 3, 10);

      expect(result.pagination.page).toBe(3);
      expect(result.pagination.pages).toBe(5);
      expect(prismaService.company.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        })
      );
    });

    it('should only return approved companies', async () => {
      const companies = [
        TestDataGenerator.createCompany({ approved: true }),
      ];

      prismaService.company.findMany.mockResolvedValueOnce(companies);
      prismaService.company.count.mockResolvedValueOnce(1);

      const result = await service.search('test', 1, 20);

      expect(result.data).toHaveLength(1);
    });
  });

  describe('getCompanyReport', () => {
    it('should return company report with full trust score', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const company = TestDataGenerator.createCompany({
        id: companyId,
        approved: true,
      });
      const trustScore = TestDataGenerator.createTrustScore({
        companyId,
        score: 85,
        tier: 'excellent',
      });
      const plan = TestDataGenerator.createPlan({ limits: { views: 100 } });
      const subscription = TestDataGenerator.createSubscription({
        tenantId,
        plan,
      });

      prismaService.company.findUnique.mockResolvedValueOnce({
        ...company,
        trustScore,
      });
      prismaService.subscription.findUnique.mockResolvedValueOnce(subscription);
      prismaService.viewQuotaUsage.findUnique.mockResolvedValueOnce({
        viewsCount: 10,
      });
      prismaService.report.count.mockResolvedValueOnce(10);

      const result = await service.getCompanyReport(companyId, tenantId);

      expect(result.status).toBe('full');
      expect(result.company).toBeDefined();
      expect(result.trustScore).toBeDefined();
    });

    it('should return preliminary report with 3-4 reports', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const company = TestDataGenerator.createCompany({ id: companyId });

      prismaService.company.findUnique.mockResolvedValueOnce(company);
      prismaService.subscription.findUnique.mockResolvedValueOnce({
        plan: { limits: { views: 100 } },
      });
      prismaService.viewQuotaUsage.findUnique.mockResolvedValueOnce({
        viewsCount: 5,
      });
      prismaService.report.count.mockResolvedValueOnce(4);

      const result = await service.getCompanyReport(companyId, tenantId);

      expect(result.status).toBe('preliminary');
      expect(result.tier).toBe('preliminary');
    });

    it('should return insufficient data for 0 reports', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const company = TestDataGenerator.createCompany({ id: companyId });

      prismaService.company.findUnique.mockResolvedValueOnce(company);
      prismaService.subscription.findUnique.mockResolvedValueOnce({
        plan: { limits: { views: 100 } },
      });
      prismaService.viewQuotaUsage.findUnique.mockResolvedValueOnce({
        viewsCount: 0,
      });
      prismaService.report.count.mockResolvedValueOnce(0);

      const result = await service.getCompanyReport(companyId, tenantId);

      expect(result.status).toBe('insufficient_data');
    });

    it('should return locked status for free plan', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const company = TestDataGenerator.createCompany({ id: companyId });
      const freePlan = TestDataGenerator.createPlan({ name: 'مجاني' });

      prismaService.company.findUnique.mockResolvedValueOnce(company);
      prismaService.subscription.findUnique.mockResolvedValueOnce({
        plan: freePlan,
      });

      const result = await service.getCompanyReport(companyId, tenantId);

      expect(result.status).toBe('locked');
      expect(result.message).toContain('الباقة المجانية');
    });

    it('should return quota exceeded when limit reached', async () => {
      const companyId = TestDataGenerator.generateUUID();
      const tenantId = TestDataGenerator.generateUUID();
      const company = TestDataGenerator.createCompany({ id: companyId });
      const plan = TestDataGenerator.createPlan({ limits: { views: 10 } });

      prismaService.company.findUnique.mockResolvedValueOnce(company);
      prismaService.subscription.findUnique.mockResolvedValueOnce({
        plan,
      });
      prismaService.viewQuotaUsage.findUnique.mockResolvedValueOnce({
        viewsCount: 10,
      });

      const result = await service.getCompanyReport(companyId, tenantId);

      expect(result.status).toBe('quota_exceeded');
      expect(result.remaining).toBe(0);
    });

    it('should throw error for non-existent company', async () => {
      prismaService.company.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getCompanyReport(
          TestDataGenerator.generateUUID(),
          TestDataGenerator.generateUUID()
        )
      ).rejects.toThrow();
    });
  });

  describe('requestAddCompany', () => {
    it('should create new company request', async () => {
      const company = TestDataGenerator.createCompany({ approved: false });

      prismaService.company.findUnique.mockResolvedValueOnce(null);
      prismaService.company.create.mockResolvedValueOnce(company);

      const result = await service.requestAddCompany(
        company.name,
        company.crNumber,
        company.sector,
        company.city
      );

      expect(result.approved).toBe(false);
      expect(result.source).toBe('community');
    });

    it('should throw error if company already exists', async () => {
      const company = TestDataGenerator.createCompany();

      prismaService.company.findUnique.mockResolvedValueOnce(company);

      await expect(
        service.requestAddCompany(
          company.name,
          company.crNumber,
          company.sector,
          company.city
        )
      ).rejects.toThrow();
    });
  });

  describe('getCompanyByCrNumber', () => {
    it('should retrieve company by CR number', async () => {
      const company = TestDataGenerator.createCompany();

      prismaService.company.findUnique.mockResolvedValueOnce(company);

      const result = await service.getCompanyByCrNumber(company.crNumber);

      expect(result.crNumber).toBe(company.crNumber);
    });
  });

  describe('claimCompanyProfile', () => {
    it('should create company profile claim', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const companyId = TestDataGenerator.generateUUID();

      prismaService.companyProfile.findUnique.mockResolvedValueOnce(null);
      prismaService.companyProfile.create.mockResolvedValueOnce({
        id: TestDataGenerator.generateUUID(),
        tenantId,
        companyId,
      });

      const result = await service.claimCompanyProfile(tenantId, companyId);

      expect(result.tenantId).toBe(tenantId);
      expect(result.companyId).toBe(companyId);
    });

    it('should throw error if company already claimed', async () => {
      const tenantId = TestDataGenerator.generateUUID();
      const existingClaim = { tenantId, companyId: TestDataGenerator.generateUUID() };

      prismaService.companyProfile.findUnique.mockResolvedValueOnce(existingClaim);

      await expect(
        service.claimCompanyProfile(tenantId, TestDataGenerator.generateUUID())
      ).rejects.toThrow();
    });
  });
});
