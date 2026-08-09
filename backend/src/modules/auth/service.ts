// Authentication module - registration, login, token management
import { prisma } from '@shared/database/prisma';
import { logger } from '@shared/utils/logger';
import { UnauthorizedError, ConflictError, ValidationError } from '@shared/types/errors';
import { config } from '@config/env';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { UserRole } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    storeId: string;
  };
  tokens: AuthTokens;
}

/**
 * Generate JWT access token
 */
function generateAccessToken(userId: string, storeId: string, role: UserRole, email: string): string {
  return jwt.sign({ userId, storeId, role, email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate refresh token and store in database
 */
async function generateRefreshToken(userId: string, deviceInfo?: string): Promise<string> {
  const token = uuid();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await prisma.session.create({
    data: {
      userId,
      refreshToken: token,
      deviceInfo,
      expiresAt,
    },
  });

  return token;
}

/**
 * Register a new user (owner registration creates a store)
 */
export async function register(input: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  storeName: string;
  gstin?: string;
}): Promise<AuthResult> {
  // Validate password strength
  if (input.password.length < 8) {
    throw new ValidationError({ password: ['Password must be at least 8 characters'] });
  }

  // Check existing user
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, 12);

  // Create store and user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        name: input.storeName,
        gstin: input.gstin,
      },
    });

    const user = await tx.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
        role: UserRole.OWNER,
        storeId: store.id,
      },
    });

    return { user, store };
  });

  // Generate tokens
  const accessToken = generateAccessToken(
    result.user.id,
    result.user.storeId,
    result.user.role,
    result.user.email
  );
  const refreshToken = await generateRefreshToken(result.user.id);

  logger.info('User registered', { userId: result.user.id, storeId: result.store.id });

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      storeId: result.user.storeId,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    },
  };
}

/**
 * Login with email and password
 */
export async function login(
  email: string,
  password: string,
  deviceInfo?: string
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const accessToken = generateAccessToken(user.id, user.storeId, user.role, user.email);
  const refreshToken = await generateRefreshToken(user.id, deviceInfo);

  logger.info('User logged in', { userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      storeId: user.storeId,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60,
    },
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshToken(refreshToken: string): Promise<AuthTokens> {
  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Delete old session (rotation)
  await prisma.session.delete({ where: { id: session.id } });

  // Generate new tokens
  const accessToken = generateAccessToken(
    session.user.id,
    session.user.storeId,
    session.user.role,
    session.user.email
  );
  const newRefreshToken = await generateRefreshToken(session.user.id, session.deviceInfo || undefined);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 7 * 24 * 60 * 60,
  };
}

/**
 * Logout - invalidate refresh token
 */
export async function logout(refreshToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { refreshToken } });
  logger.info('User logged out');
}
