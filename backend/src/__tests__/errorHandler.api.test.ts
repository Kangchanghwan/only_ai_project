import express from 'express';
import { AddressInfo } from 'net';
import { Server } from 'http';
import errorHandler from '../middleware/errorHandler';
import logger from '../utils/logger';

describe('전역 에러 핸들러', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.post('/echo', (_req, res) => { res.json({ ok: true }); });
    app.get('/boom', () => { throw new Error('내부 비밀 메시지'); });
    app.use(errorHandler);
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => { server.close(() => done()); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('잘못된 JSON 본문은 400 + { error }', async () => {
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const res = await fetch(`${baseUrl}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    expect(res.status).toBe(400);
    expect(typeof ((await res.json()) as { error: unknown }).error).toBe('string');
    expect(spy).toHaveBeenCalled();
  });

  test('예외는 500 + 일반 메시지, 스택·내부 메시지는 응답에 없고 method/path는 로그에 남는다', async () => {
    const spy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const res = await fetch(`${baseUrl}/boom?secret=1`);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: '서버 내부 오류' });
    expect(text).not.toContain('내부 비밀 메시지');
    expect(text).not.toContain('at ');
    const args = spy.mock.calls[0];
    expect(args).toContain('GET');
    expect(args).toContain('/boom');
    expect(args).not.toContain('/boom?secret=1');
  });
});
