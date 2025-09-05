import { Readable } from 'stream';

import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    // allow large/streaming responses
    responseLimit: false,
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const { src, referer } = req.query as {
      src?: string | string[];
      referer?: string | string[];
    };

    if (!src) {
      res.status(400).json({ error: 'Missing src parameter' });
      return;
    }

    const srcUrl = typeof src === 'string' ? src : src.join('');
    const refererHeader =
      typeof referer === 'string' ? referer : referer?.join(' ') ?? '';

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      ...(refererHeader ? { Referer: refererHeader } : {}),
    };

    // Forward Range header for seeking/streaming
    const range = req.headers.range as string | undefined;
    if (range) headers.Range = range;

    const upstream = await fetch(srcUrl, { headers });

    // Forward status code
    res.status(upstream.status);

    // Forward important headers
    const forwardHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'cache-control',
      'etag',
      'expires',
      'last-modified',
      'vary',
      'date',
    ];
    forwardHeaders.forEach((h) => {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    // Stream body to the client
    if (upstream.body) {
      // Node 18+: convert Web ReadableStream to Node stream
      // @ts-ignore - fromWeb exists in Node >= 17
      const stream: Readable = (Readable as any).fromWeb
        ? // @ts-ignore
          (Readable as any).fromWeb(upstream.body)
        : // Fallback: buffer then send
          null;

      if (stream) {
        stream.pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
  } catch (e: any) {
    res.status(502).json({
      error: 'Upstream fetch failed',
      message: e?.message || String(e),
    });
  }
}
