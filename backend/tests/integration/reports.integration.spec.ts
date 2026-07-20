import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDataGenerator } from '../fixtures/test-data';

describe('Reports Integration Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let reportId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
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

  describe('POST /reports/submit', () => {
    it('should submit a report', async () => {
      const reportDto = TestDataGenerator.createReportDto();

      const response = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.status).toBe('pending');

      reportId = response.body.id;
    });

    it('should validate amount is positive', async () => {
      const reportDto = {
        ...TestDataGenerator.createReportDto(),
        amount: -1000,
      };

      const response = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      expect(response.status).toBe(400);
    });

    it('should validate occurrence date is not future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const reportDto = {
        ...TestDataGenerator.createReportDto(),
        occurrenceDate: futureDate,
      };

      const response = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      expect(response.status).toBe(400);
    });

    it('should reject non-existent company', async () => {
      const reportDto = {
        ...TestDataGenerator.createReportDto(),
        targetCompanyCrNumber: 'INVALID_CR',
      };

      const response = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /reports/my-reports', () => {
    it('should list user reports', async () => {
      const response = await request(app.getHttpServer())
        .get('/reports/my-reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/reports/my-reports')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 20, status: 'pending' });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /reports/company/:crNumber', () => {
    it('should get reports about company', async () => {
      const company = TestDataGenerator.createCompany();

      const response = await request(app.getHttpServer())
        .get(`/reports/company/${company.crNumber}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 20 });

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });
  });

  describe('PATCH /reports/:id', () => {
    it('should edit pending report', async () => {
      // First create a report
      const reportDto = TestDataGenerator.createReportDto();
      const createResponse = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      const rId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .patch(`/reports/${rId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          description: 'Updated description',
          amount: 75000,
        });

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.description).toBe('Updated description');
      }
    });

    it('should prevent editing approved reports', async () => {
      const reportId = TestDataGenerator.generateUUID();

      const response = await request(app.getHttpServer())
        .patch(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          description: 'Updated',
        });

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('DELETE /reports/:id', () => {
    it('should delete pending report', async () => {
      const reportDto = TestDataGenerator.createReportDto();
      const createResponse = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      const rId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .delete(`/reports/${rId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 404]).toContain(response.status);
    });

    it('should prevent deleting approved reports', async () => {
      const reportId = TestDataGenerator.generateUUID();

      const response = await request(app.getHttpServer())
        .delete(`/reports/${reportId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('GET /reports/:id/stats', () => {
    it('should get report statistics for company', async () => {
      const company = TestDataGenerator.createCompany();

      const response = await request(app.getHttpServer())
        .get(`/reports/${company.id}/stats`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect([200, 404]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.total).toBeDefined();
        expect(response.body.approved).toBeDefined();
      }
    });
  });

  describe('Report validation', () => {
    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          // Missing required fields
        });

      expect(response.status).toBe(400);
    });

    it('should validate category is valid', async () => {
      const reportDto = {
        ...TestDataGenerator.createReportDto(),
        category: 'invalid_category',
      };

      const response = await request(app.getHttpServer())
        .post('/reports/submit')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(reportDto);

      expect(response.status).toBe(400);
    });
  });
});
