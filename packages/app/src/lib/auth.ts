import jwt from 'jsonwebtoken';

/**
 * Verify JWT token and return decoded payload
 * @param token - JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyJWT(token: string): any | null {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not set');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return null;
  }
}

/**
 * Sign JWT token with payload
 * @param payload - Data to encode in token
 * @param expiresIn - Token expiration time (default: 1d)
 * @returns Signed JWT token
 */
export function signJWT(payload: any, expiresIn: string = '1d'): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }

  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn });
}
