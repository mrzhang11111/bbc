/* eslint-disable @next/next/no-html-link-for-pages */
import { getAnimeTitle } from './api';

// Consumet API base URLs (fallbacks). We'll try each until one succeeds.
const CONSUMET_API_BASES = [
  'https://api.consumet.org',
  'https://api-consumet-org-psi-nine.vercel.app',
  // community mirrors (may be unstable; keep after the primary domain)
  'https://consumet-api-ten.vercel.app',
];

// Types for Consumet API responses
interface ConsumetSearchResult {
  id: string;
  title: string;
  url: string;
  image: string;
  releaseDate: string;
  subOrDub: string;
}

interface ConsumetAnimeInfo {
  id: string;
  title: string;
  url: string;
  genres: string[];
  totalEpisodes: number;
  image: string;
  releaseDate: string;
  description: string;
  subOrDub: string;
  type: string;
  status: string;
  otherName: string;
  episodes: ConsumetEpisode[];
}

interface ConsumetEpisode {
  id: string;
  number: number;
  url: string;
}

interface ConsumetStreamingData {
  headers: {
    Referer: string;
    'User-Agent'?: string;
  };
  sources: {
    url: string;
    quality: string;
    isM3U8: boolean;
  }[];
}

// Types for meta/anilist endpoints
interface MetaEpisode {
  id: string; // provider episode id (e.g., gogoanime)
  number: number;
  isFiller?: boolean;
}

interface MetaEpisodesResponse {
  episodes: MetaEpisode[];
}

interface MetaWatchResponse {
  headers?: { Referer?: string };
  sources?: { url: string; quality?: string; isM3U8?: boolean }[];
}

// Generic JSON fetcher with base URL fallbacks
async function fetchJsonWithFallback<T>(path: string): Promise<T | null> {
  // Try all bases in parallel and return the first successful JSON
  const attempts = CONSUMET_API_BASES.map((base) => {
    const url = `${base}${path}`;
    return fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
      },
    }).then((resp) => {
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} @ ${url}`);
      }
      return resp.json();
    });
  });
  const results = await Promise.allSettled(attempts);
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      return r.value as T;
    }
  }
  return null;
}

// Helper function to search anime using Consumet API
async function searchAnime(query: string): Promise<ConsumetSearchResult[]> {
  const data = await fetchJsonWithFallback<any>(
    `/anime/gogoanime/${encodeURIComponent(query)}`
  );
  return data?.results || [];
}

// Helper function to get anime info using Consumet API
async function getAnimeInfo(id: string): Promise<ConsumetAnimeInfo | null> {
  const data = await fetchJsonWithFallback<ConsumetAnimeInfo>(
    `/anime/gogoanime/info/${id}`
  );
  return data ?? null;
}

// Helper function to get streaming links using Consumet API
async function getStreamingLinks(
  episodeId: string
): Promise<ConsumetStreamingData | null> {
  const data = await fetchJsonWithFallback<ConsumetStreamingData>(
    `/anime/gogoanime/watch/${episodeId}`
  );
  return data ?? null;
}

// Meta/anilist helpers (more reliable mapping by AniList ID)
async function getMetaEpisodesByAniListId(
  aniListId: number
): Promise<MetaEpisode[] | null> {
  const data = await fetchJsonWithFallback<MetaEpisodesResponse>(
    `/meta/anilist/episodes/${aniListId}?provider=gogoanime`
  );
  return data?.episodes ?? null;
}

async function getMetaWatchByEpisodeId(
  episodeId: string
): Promise<MetaWatchResponse | null> {
  const data = await fetchJsonWithFallback<MetaWatchResponse>(
    `/meta/anilist/watch/${encodeURIComponent(episodeId)}?provider=gogoanime`
  );
  return data ?? null;
}

export async function getAnimeSlug(title: string, episode: number) {
  const emptyData = {
    sub: {
      Referer: '',
      sources: [],
    },
    dub: {
      Referer: '',
      sources: [],
    },
    episodes: 0,
  };

  if (!title || title === '') return emptyData;

  // Primary path: use meta/anilist (more robust for长番/季分档)
  // We need AniList id here; since this function is title-based, we'll only
  // use meta path when getAnime() calls us with both romaji/english and later
  // we can pass AniList id at a higher level. As a workaround here, keep the
  // legacy search method, and meta path will be used in getAnime() directly.

  // Legacy search-based path (fallback)
  // Search for anime using Consumet API (try both title and a simplified variant)
  const normalized = title.replace(/\s+/g, ' ').trim();
  const simplified = normalized.replace(/[^a-zA-Z0-9\s:-]/g, '');
  let searchResults = await searchAnime(normalized);
  if (!searchResults.length) {
    searchResults = await searchAnime(simplified);
  }
  if (searchResults.length === 0) return emptyData;

  // Fetch top candidates in parallel, then choose the first containing the requested episode
  const candidates = searchResults.slice(0, 5);
  const infoResults = await Promise.allSettled(
    candidates.map((c) => getAnimeInfo(c.id))
  );
  let animeInfo: ConsumetAnimeInfo | null = null;
  let targetEpisode: ConsumetEpisode | undefined;
  for (let i = 0; i < infoResults.length; i += 1) {
    const r = infoResults[i];
    if (r.status !== 'fulfilled' || !r.value) {
      // skip failures
    } else {
      const info = r.value;
      const exact = info.episodes.find((ep) => ep.number === episode);
      const loose =
        exact ||
        info.episodes.find((ep) => Number(ep.number) === Number(episode));
      if (loose) {
        animeInfo = info;
        targetEpisode = loose;
        break;
      }
      // keep the first valid info as fallback for totalEpisodes
      if (!animeInfo) animeInfo = info;
    }
  }
  if (!animeInfo || !targetEpisode) return emptyData;

  // Get streaming links for both sub and dub versions
  const subLinks = await getStreamingLinks(targetEpisode.id);

  // Try to find dub version by modifying the episode ID
  const dubEpisodeId = targetEpisode.id.includes('-dub-')
    ? targetEpisode.id
    : targetEpisode.id.replace('-episode-', '-dub-episode-');
  const dubLinks = await getStreamingLinks(dubEpisodeId);

  return {
    sub: {
      Referer: subLinks?.headers?.Referer || '',
      sources: (subLinks?.sources || []).map((s) => ({ file: s.url })) as any,
    },
    dub: {
      Referer: dubLinks?.headers?.Referer || '',
      sources: (dubLinks?.sources || []).map((s) => ({ file: s.url })) as any,
    },
    episodes: animeInfo.totalEpisodes || animeInfo.episodes.length,
  };
}

export async function getAnime(id: number, episode: number) {
  const animeData = await getAnimeTitle({ id });
  const titleData = animeData?.Media?.title;
  let english = titleData?.english || '';
  let romaji = titleData?.romaji || '';

  // ensure both of them don't have null value
  english = english || romaji;
  romaji = romaji || english;

  // lower case both the titles
  english = english.toLowerCase();
  romaji = romaji.toLowerCase();

  // First try meta/anilist by AniList ID for robust episode mapping
  try {
    const metaEpisodes = await getMetaEpisodesByAniListId(id);
    if (metaEpisodes && metaEpisodes.length) {
      const target = metaEpisodes.find(
        (e) => Number(e.number) === Number(episode)
      );
      if (target) {
        const subLinks = await getMetaWatchByEpisodeId(target.id);
        // Try to derive a dub id variant for meta as well (provider-dependent)
        const dubId = target.id.includes('-dub-')
          ? target.id
          : target.id.replace('-episode-', '-dub-episode-');
        const dubLinks = await getMetaWatchByEpisodeId(dubId);

        return {
          sub: {
            Referer: subLinks?.headers?.Referer || '',
            sources: (subLinks?.sources || []).map((s) => ({
              file: s.url,
            })) as any,
          },
          dub: {
            Referer: dubLinks?.headers?.Referer || '',
            sources: (dubLinks?.sources || []).map((s) => ({
              file: s.url,
            })) as any,
          },
          episodes: metaEpisodes.length,
        };
      }
    }
  } catch {
    // ignore and fallback to title search
  }

  // if the titles are same run this function once (legacy)
  if (english === romaji) {
    return getAnimeSlug(english, episode);
  }

  // get both romaji and english results
  const romajiAnime = getAnimeSlug(romaji, episode);
  const englishAnime = getAnimeSlug(english, episode);

  // grab the one which has episodes key
  const anime = await Promise.all([englishAnime, romajiAnime]).then((r) =>
    r[0].episodes > 0 ? r[0] : r[1]
  );

  return anime;
}
