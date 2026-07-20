import { v4 as uuid } from 'uuid';
import * as bcrypt from 'bcryptjs';

export class TestDataGenerator {
  static generateUUID(): string {
    return uuid();
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  static createTenant(overrides = {}): any {
    return {
      id: this.generateUUID(),
      name: 'Test Company',
      crNumber: '1010123456',
      email: 'test@company.com',
      phone: '+966501234567',
      city: 'Riyadh',
      sector: 'Technology',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static async createUser(overrides = {}): Promise<any> {
    const password = 'Test@1234';
    return {
      id: this.generateUUID(),
      tenantId: this.generateUUID(),
      email: 'user@test.com',
      passwordHash: await this.hashPassword(password),
      firstName: 'Test',
      lastName: 'User',
      phone: '+966501234567',
      role: 'company_admin',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      password,
      ...overrides,
    };
  }

  static createCompany(overrides = {}): any {
    return {
      id: this.generateUUID(),
      name: 'Test Company',
      crNumber: '1010123456',
      sector: 'Technology',
      city: 'Riyadh',
      source: 'admin',
      crStatus: 'active',
      approved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createReport(overrides = {}): any {
    return {
      id: this.generateUUID(),
      submittedByTenantId: this.generateUUID(),
      targetCompanyId: this.generateUUID(),
      category: 'payment_delay',
      description: 'Test report description',
      amount: 10000,
      dueDate: new Date(),
      occurrenceDate: new Date(),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createPlan(overrides = {}): any {
    return {
      id: this.generateUUID(),
      name: 'Basic Plan',
      description: 'Basic subscription plan',
      price: 99,
      currency: 'SAR',
      billingPeriod: 'monthly',
      limits: {
        views: 100,
        reports: 10,
      },
      features: ['search', 'view_reports'],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createSubscription(overrides = {}): any {
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    return {
      id: this.generateUUID(),
      tenantId: this.generateUUID(),
      planId: this.generateUUID(),
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: endDate,
      autoRenew: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createTrustScore(overrides = {}): any {
    return {
      id: this.generateUUID(),
      companyId: this.generateUUID(),
      score: 75,
      tier: 'good',
      paymentReliability: 80,
      businessStability: 70,
      reportCount: 5,
      lastUpdated: new Date(),
      ...overrides,
    };
  }

  static createAuditLog(overrides = {}): any {
    return {
      id: this.generateUUID(),
      action: 'admin:approve_report',
      entity: 'report',
      entityId: this.generateUUID(),
      userId: this.generateUUID(),
      tenantId: this.generateUUID(),
      meta: {},
      ipAddress: '127.0.0.1',
      userAgent: 'Test Agent',
      createdAt: new Date(),
      ...overrides,
    };
  }

  static createRegisterDto(): any {
    return {
      name: 'Test Company',
      crNumber: '1010123456',
      email: 'newuser@test.com',
      password: 'Test@1234',
      confirmPassword: 'Test@1234',
      phone: '+966501234567',
      city: 'Riyadh',
      sector: 'Technology',
    };
  }

  static createLoginDto(): any {
    return {
      email: 'user@test.com',
      password: 'Test@1234',
    };
  }

  static createReportDto(): any {
    return {
      targetCompanyCrNumber: '1010123456',
      category: 'payment_delay',
      description: 'Payment was delayed by 30 days',
      amount: 50000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      occurrenceDate: new Date(),
    };
  }

  static createUpdateUserStatusDto(): any {
    return {
      status: 'suspended',
      reason: 'Violation of terms',
    };
  }
}

export const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  report: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  plan: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  trustScore: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  viewQuotaUsage: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};
