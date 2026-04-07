import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

export const signToken = (id: string, email: string, role: string): string => {
    return jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '1h' });
};
