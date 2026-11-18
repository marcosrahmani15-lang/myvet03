import type { VercelRequest, VercelResponse } from '@vercel/node';
import { runVercelApi } from '../_adapter.ts';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await runVercelApi(req, res);
}
