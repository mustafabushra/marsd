import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { TestDataGenerator } from '../fixtures/test-data';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('should register new user with valid data', async () => {
      const registerDto = TestDataGenerator.createRegisterDto();

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);

      expect(response.status).toBe(201);
      expect(response.body.tenant).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(registerDto.email);
    });

    it('should return 400 for duplicate CR number', async () => {
      const registerDto1 = TestDataGenerator.createRegisterDto();
      const registerDto2 = {
        ...TestDataGenerator.createRegisterDto(),
        crNumber: registerDto1.crNumber,
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto1);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto2);

      expect(response.status).toBe(400);
    });

    it('should return 400 for duplicate email', async () => {
      const registerDto1 = TestDataGenerator.createRegisterDto();
      const registerDto2 = {
        ...TestDataGenerator.createRegisterDto(),
        email: registerDto1.email,
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto1);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto2);

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const invalidDto = {
        name: 'Test',
        // Missing required fields
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(invalidDto);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('should login with valid credentials', async () => {
      const registerDto = TestDataGenerator.createRegisterDto();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: registerDto.email,
          password: registerDto.password,
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user.email).toBe(registerDto.email);

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should return 401 for invalid email', async () => {
      const loginDto = {
        email: 'nonexistent@test.com',
        password: 'Test@1234',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      expect(response.status).toBe(401);
    });

    it('should return 401 for invalid password', async () => {
      const registerDto = TestDataGenerator.createRegisterDto();

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerDto);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: registerDto.email,
          password: 'WrongPassword123',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should generate new access token with valid refresh token', async () => {
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

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: loginResponse.body.refreshToken,
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid.token.here',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Protected endpoints', () => {
    it('should deny access without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .query({ q: 'test' });

      expect(response.status).toBe(401);
    });

    it('should allow access with valid token', async () => {
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

      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .query({ q: 'test' });

      expect(response.status).toBe(200);
    });

    it('should deny access with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/companies/search')
        .set('Authorization', 'Bearer invalid.token.here')
        .query({ q: 'test' });

      expect(response.status).toBe(401);
    });
  });
});
