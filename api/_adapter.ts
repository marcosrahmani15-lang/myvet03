import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { HttpRequest } from '../server/core/http.ts';
import { dispatchApiRequest } from '../server/core/router.ts';

export async function runVercelApi(req: VercelRequest, res: VercelResponse): Promise<void> {
  const urlObj = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);

  const httpReq: HttpRequest = {
    method: (req.method || 'GET').toUpperCase(),
    url: req.url || '/',
    path: urlObj.pathname,
    query: req.query as Record<string, string | string[] | undefined>,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
    rawBody: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
    ip: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim(),
  };

  const result = await dispatchApiRequest(httpReq);

  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }
  }
  if (result.cookies && result.cookies.length > 0) {
    res.setHeader('Set-Cookie', result.cookies);
  }
  res.status(result.status).json(result.body);
}
