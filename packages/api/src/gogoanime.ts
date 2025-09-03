import { getAnimeTitle } from './api';

// Consumet API base URL
const CONSUMET_API_BASE = 'https://api-consumet-org-psi-nine.vercel.app';

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

// Helper function to search anime using Consumet API
async function searchAnime(query: string): Promise<ConsumetSearchResult[]> {
  try {
    const response = await fetch(`${CONSUMET_API_BASE}/anime/gogoanime/${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Error searching anime:', error);
    return [];
  }
}

// Helper function to get anime info using Consumet API
async function getAnimeInfo(id: string): Promise<ConsumetAnimeInfo | null> {
  try {
    const response = await fetch(`${CONSUMET_API_BASE}/anime/gogoanime/info/${id}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting anime info:', error);
    return null;
  }
}

// Helper function to get streaming links using Consumet API
async function getStreamingLinks(episodeId: string): Promise<ConsumetStreamingData | null> {
  try {
    const response = await fetch(`${CONSUMET_API_BASE}/anime/gogoanime/watch/${episodeId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error getting streaming links:', error);
    return null;
  }
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

  // Search for anime using Consumet API
  const searchResults = await searchAnime(title);
  if (searchResults.length === 0) return emptyData;

  // Get anime info for the first result
  const animeInfo = await getAnimeInfo(searchResults[0].id);
  if (!animeInfo) return emptyData;

  // Find the specific episode
  const targetEpisode = animeInfo.episodes.find(ep => ep.number === episode);
  if (!targetEpisode) return emptyData;

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
      sources: subLinks?.sources || [],
    },
    dub: {
      Referer: dubLinks?.headers?.Referer || '',
      sources: dubLinks?.sources || [],
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

  // if the titles are same run this function once
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
