import { NextApiRequest, NextApiResponse } from 'next';

import { getAnime, getAnimeTitle } from '@animeflix/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id, episode, debug } = req.query as {
      id?: string | string[];
      episode?: string | string[];
      debug?: string | string[];
    };

    // Normalize query params without nested ternaries
    const normalizeParam = (v?: string | string[]) => {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.join('');
      return '';
    };
    const idStr = normalizeParam(id);
    const epStr = normalizeParam(episode);

    const idNum = parseInt(idStr, 10);
    const epNum = parseInt(epStr, 10);

    if (!Number.isFinite(idNum) || !Number.isFinite(epNum)) {
      return res
        .status(400)
        .json({ error: 'Invalid id or episode', id: idStr, episode: epStr });
    }

    const data = await getAnime(idNum, epNum);

    // Optional debug: include AniList titles and input echo
    if (debug === '1' || debug === 'true') {
      try {
        const ani = await getAnimeTitle({ id: idNum });
        (data as any).debug = {
          input: { id: idNum, episode: epNum },
          aniListTitle: ani?.Media?.title ?? null,
        };
      } catch (e) {
        (data as any).debug = {
          input: { id: idNum, episode: epNum },
          aniListTitle: null,
        };
      }
    }

    // Prevent caching while debugging source selection
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json(data);
  } catch (err: any) {
    // Surface error details to help diagnose empty responses
    const message = err?.message || 'Unknown error';
    return res.status(500).json({ error: 'Internal Server Error', message });
  }
}
