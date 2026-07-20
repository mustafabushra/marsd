import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { RegisterDto } from '../../../src/modules/auth/dto/register.dto';
import { LoginDto } from '../../../src/modules/auth/dto/login.dto';
import { TestDataGenerator, mockPrismaService } from '../../fixtures/test-data';
import * as bcrypt from 'bcryptjs';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: any;
  let jwtService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.token.here'),
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new tenant and user', async () => {
      const registerDto = TestDataGenerator.createRegisterDto();
      const tenant = TestDataGenerator.createTenant({
        crNumber: registerDto.crNumber,
        email: registerDto.email,
      });
      const user = await TestDataGenerator.createUser({
        tenantId: tenant.id,
        email: registerDto.email,
      });
      const plan = TestDataGenerator.createPlan({ name: 'مجاني' });

      prismaService.tenant.findUnique.mockResolvedValueOnce(null);
      prismaService.user.findUnique.mockResolvedValueOnce(null);
      prismaService.tenant.create.mockResolvedValueOnce(tenant);
      prismaService.user.create.mockResolvedValueOnce(user);
      prismaService.plan.findFirst.mockResolvedValueOnce(plan);
      prismaService.subscription.create.mockResolvedValueOnce({});
      prismaService.auditLog.create.mockResolvedValueOnce({});

      const result = await service.register(registerDto);

      expect(result.tenant).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.message).toBe('تم إنشاء الحساب بنجاح');
      expect(prismaService.tenant.create).toHaveBeenCalled();
      expect(prismaService.user.create).toHaveBeenCalled();
    });

    it('should throw error if CR number already exists', async () => {
      const registerDto = TestDataGenerator.createRegisterDto();
      const existingTenant = TestDataGenerator.createTenant({
        crNumber: registerDto.crNumber,
      });

      prismaService.tenant.findUnique.mockResolvedValueOnce(existingTenant);

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if email already exists', async () => {
      const registerDto = TestDataGenerator.createRegisterDto();
      const existingUser = await TestDataGenerator.createUser({
        email: registerDto.email,
      });

      prismaService.tenant.findUnique.mockResolvedValueOnce(null);
      prismaService.user.findUnique.mockResolvedValueOnce(existingUser);

      await expect(service.register(registerDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const loginDto = TestDataGenerator.createLoginDto();
      const hashedPassword = await bcrypt.hash(loginDto.password, 10);
      const user = await TestDataGenerator.createUser({
        email: loginDto.email,
        passwordHash: hashedPassword,
      });
      const tenant = TestDataGenerator.createTenant();

      prismaService.user.findUnique.mockResolvedValueOnce({
        ...user,
        tenant,
      });

      const result = await service.login(loginDto);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe(loginDto.email);
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('should throw error for non-existent user', async () => {
      const loginDto = TestDataGenerator.createLoginDto();

      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for invalid password', async () => {
      const loginDto = TestDataGenerator.createLoginDto();
      const user = await TestDataGenerator.createUser({
        email: loginDto.email,
        passwordHash: await bcrypt.hash('WrongPassword123', 10),
      });

      prismaService.user.findUnique.mockResolvedValueOnce(user);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should generate new access token with valid refresh token', async () => {
      const user = await TestDataGenerator.createUser();

      jwtService.verify.mockReturnValueOnce({ sub: user.id });
      prismaService.user.findUnique.mockResolvedValueOnce(user);

      const result = await service.refresh('valid.refresh.token');

      expect(result.accessToken).toBeDefined();
      expect(jwtService.verify).toHaveBeenCalledWith('valid.refresh.token');
    });

    it('should throw error for invalid refresh token', async () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      await expect(service.refresh('invalid.token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error if user not found during refresh', async () => {
      const userId = TestDataGenerator.generateUUID();

      jwtService.verify.mockReturnValueOnce({ sub: userId });
      prismaService.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh('valid.token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
