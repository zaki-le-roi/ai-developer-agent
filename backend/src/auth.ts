import { randomBytes, randomUUID, scryptSync, createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getDb } from './db.js';
import { grantPermission } from './permission-store.js';

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function register(email: string, password: string) {
  if (password.length < 10) throw new Error('كلمة المرور يجب أن تكون 10 أحرف على الأقل.');
  const db = getDb();
  const id = randomUUID();
  db.prepare('INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)')
    .run(id, email.toLowerCase(), hashPassword(password), new Date().toISOString());
  await grantPermission(id, null, 'READ_PROJECT');
  await grantPermission(id, null, 'WRITE_PROJECT');
  await grantPermission(id, null, 'RUN_COMMAND');
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), id, hashToken(token), new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(), new Date().toISOString());
  return { id, email: email.toLowerCase(), token };
}

export function login(email: string, password: string) {
  const user = getDb().prepare('SELECT id,email,password_hash FROM users WHERE email=?')
    .get(email.toLowerCase()) as { id: string; email: string; password_hash: string } | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) throw new Error('بيانات الدخول غير صحيحة.');
  const token = randomBytes(32).toString('base64url');
  getDb().prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)')
    .run(randomUUID(), user.id, hashToken(token), new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(), new Date().toISOString());
  return { token, user: { id: user.id, email: user.email } };
}

export function logout(req: Request) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const result = getDb().prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  return Number(result.changes) > 0;
}

export function authenticate(req: Request) {
  const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  return getDb().prepare(
    'SELECT u.id,u.email,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',
  ).get(hashToken(token)) as { id: string; email: string; expires_at: string } | undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = authenticate(req);
  if (!user || new Date(user.expires_at) <= new Date()) {
    res.status(401).json({ success: false, error: 'المصادقة مطلوبة.' });
    return;
  }
  res.locals.user = user;
  next();
}