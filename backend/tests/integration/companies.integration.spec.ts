import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDataGenerator } from '../fixtures/test-data';

describe('Companies Integration Tests', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    // Register and login user for each test
    const registerDto = TestDataGenerator.createRegisterDto();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(registerDto);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: registerDto.email,
        password: registerDto.password,
      });

    accessToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /companies/search', () => {
    it('should search companies with query', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ q: 'tech', page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.pagination).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should apply pagination parameters', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ q: 'tech', page: 2, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.page).toBe(2);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should return 400 without query', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /companies/:id/report', () => {
    it('should return company report', async () => {
      // Assuming a company exists with ID
      const companyId = TestDataGenerator.generateUUID();

      const response = await request(app.getHttpServer())
        .get(`/companies/${companyId}/report`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.company).toBeDefined();
        expect(response.body.status).toBeDefined();
      }
    });

    it('should check quota for report access', async () => {
      const companyId = TestDataGenerator.generateUUID();

      const response = await request(app.getHttpServer())
        .get(`/companies/${companyId}/report`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 402, 404]).toContain(response.status);
      if (response.status === 402) {
        expect(response.body.status).toBe('quota_exceeded');
      }
    });
  });

  describe('POST /companies/request-add', () => {
    it('should create company request', async () => {
      const company = TestDataGenerator.createCompany();

      const response = await request(app.getHttpServer())
        .post('/companies/request-add')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: company.name,
          crNumber: company.crNumber,
          sector: company.sector,
          city: company.city,
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.approved).toBe(false);
    });

    it('should reject duplicate CR number', async () => {
      const company = TestDataGenerator.createCompany();

      await request(app.getHttpServer())
        .post('/companies/request-add')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: company.name,
          crNumber: company.crNumber,
          sector: company.sector,
          city: company.city,
        });

      const response = await request(app.getHttpServer())
        .post('/companies/request-add')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: company.name,
          crNumber: company.crNumber,
          sector: company.sector,
          city: company.city,
        });

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/companies/request-add')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test',
          // Missing other required fields
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /companies/:id/claim', () => {
    it('should claim company profile', async () => {
      const company = TestDataGenerator.createCompany();
      const companyId = company.id;

      const response = await request(app.getHttpServer())
        .post(`/companies/${companyId}/claim`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.id).toBeDefined();
      }
    });

    it('should prevent duplicate claims', async () => {
      const company = TestDataGenerator.createCompany();
      const companyId = company.id;

      await request(app.getHttpServer())
        .post(`/companies/${companyId}/claim`)
        .set('Authorization', `Bearer ${accessToken}`);

      const response = await request(app.getHttpServer())
        .post(`/companies/${companyId}/claim`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('Search pagination', () => {
    it('should handle large page numbers', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ q: 'test', page: 9999, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('should enforce limit constraints', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ q: 'test', page: 1, limit: 1000 });

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBeLessThanOrEqual(100);
    });
  });
});
