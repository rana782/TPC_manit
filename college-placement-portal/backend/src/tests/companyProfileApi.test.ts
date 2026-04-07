import 'dotenv/config';
import request from 'supertest';
import app from '../app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Company profile lookup/suggest APIs', () => {
  const coordUser = { email: 'coord_company_api@example.com', password: 'Password@123', role: 'COORDINATOR' };
  let token = '';

  beforeAll(async () => {
    await prisma.companyProfile.deleteMany({});
    await prisma.user.deleteMany({ where: { email: coordUser.email } });
    await request(app).post('/api/auth/register').send({ name: 'Coord Company', email: coordUser.email, password: coordUser.password });
    await request(app).post('/api/auth/verify-email').send({ email: coordUser.email, otp: '123456' });
    await prisma.user.update({
      where: { email: coordUser.email },
      data: { role: 'COORDINATOR', isVerified: true }
    });
    const login = await request(app).post('/api/auth/login').send({ email: coordUser.email, password: coordUser.password });
    token = login.body.token;
    await prisma.companyProfile.upsert({
      where: { normalizedName: 'tcs' },
      update: { companyName: 'TCS', rating: 4.2, reviewCount: 120345, source: 'seed' },
      create: { companyName: 'TCS', normalizedName: 'tcs', rating: 4.2, reviewCount: 120345, source: 'seed' }
    });
    await prisma.companyProfile.upsert({
      where: { normalizedName: 'infosys' },
      update: { companyName: 'Infosys', rating: 3.9, reviewCount: 80000, source: 'seed' },
      create: { companyName: 'Infosys', normalizedName: 'infosys', rating: 3.9, reviewCount: 80000, source: 'seed' }
    });
  });

  afterAll(async () => {
    await prisma.companyProfile.deleteMany({});
    await prisma.user.deleteMany({ where: { email: coordUser.email } });
    await prisma.$disconnect();
  });

  test('lookup should return found by normalized name', async () => {
    const res = await request(app)
      .get('/api/companies/lookup?name=TCS Ltd')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.rating).toBe(4.2);
    expect(res.body.reviews).toBe(120345);
  });

  test('suggest should return list by partial query', async () => {
    const res = await request(app)
      .get('/api/companies/suggest?q=inf')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].companyName).toBe('Infosys');
  });
});

