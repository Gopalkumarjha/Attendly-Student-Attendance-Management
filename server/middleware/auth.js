import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'attendly-local-development-secret-change-me');

export async function authenticate(request, response, next) {
  try {
    if (!jwtSecret) return response.status(503).json({ message: 'JWT_SECRET is not configured.' });
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return response.status(401).json({ message: 'Sign in to continue.' });
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub).select('name email role active');
    if (!user || !user.active) return response.status(401).json({ message: 'This account is unavailable.' });
    request.user = user;
    next();
  } catch (error) {
    response.status(401).json({ message: error.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' : 'Invalid session.' });
  }
}

export function authorize(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user?.role)) return response.status(403).json({ message: 'You do not have permission to perform this action.' });
    next();
  };
}

export function createToken(user) {
  if (!jwtSecret) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign({ sub: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: '8h', issuer: 'attendly-api' });
}
