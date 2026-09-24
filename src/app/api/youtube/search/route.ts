import { NextRequest, NextResponse } from 'next/server';
import type { YoutubeApiItem, SearchApiResponse, VideoItem } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const rawMax = Number(searchParams.get('maxResults') ?? 24);
  const maxResults = Math.min(Math.max(isNaN(rawMax) ? 24 : rawMax, 24), 50);

  if (!q) {
    return NextResponse.json<SearchApiResponse>(
      { videos: [], error: 'Missing query parameter "q"' },
      { status: 400 },
    );
  }

  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey || apiKey === 'your_youtube_data_api_key_here') {
    return NextResponse.json<SearchApiResponse>(
      {
        videos: [],
        error:
          'YouTube API key is not configured. Please add YOUTUBE_DATA_API_KEY to your .env.local file.',
      },
      { status: 503 },
    );
  }

  try {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', q);
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', String(maxResults));
    searchUrl.searchParams.set('key', apiKey);

    const res = await fetch(searchUrl.toString(), {
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = await res.json().catch(() => ({} as any));
      const msg = err?.error?.message ?? `YouTube API error ${res.status}`;
      return NextResponse.json<SearchApiResponse>(
        { videos: [], error: msg },
        { status: res.status },
      );
    }

    const data = await res.json();
    const rawItems = (data.items as YoutubeApiItem[]) || [];
    const validItems = rawItems.filter((item) => item?.id?.videoId);

    // Extract video IDs for secondary call to contentDetails (durations)
    const videoIds = validItems.map((item) => item.id.videoId);
    const durationMap = new Map<string, string>();

    if (videoIds.length > 0) {
      try {
        const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        detailsUrl.searchParams.set('part', 'contentDetails');
        detailsUrl.searchParams.set('id', videoIds.join(','));
        detailsUrl.searchParams.set('key', apiKey);

        const detailsRes = await fetch(detailsUrl.toString(), {
          next: { revalidate: 300 },
        });

        if (detailsRes.ok) {
          const detailsData = await detailsRes.json();
          if (Array.isArray(detailsData.items)) {
            for (const item of detailsData.items) {
              if (item?.id && item?.contentDetails?.duration) {
                durationMap.set(item.id, parseIsoDuration(item.contentDetails.duration));
              }
            }
          }
        }
      } catch (durationErr) {
        console.warn('[api/youtube/search] Warning fetching video durations:', durationErr);
      }
    }

    const videos: VideoItem[] = validItems.map((item) => ({
      id: item.id.videoId,
      title: decodeHtmlEntities(item.snippet.title),
      description: item.snippet.description ?? '',
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      duration: durationMap.get(item.id.videoId) || undefined,
      thumbnail:
        item.snippet.thumbnails?.high?.url ??
        item.snippet.thumbnails?.medium?.url ??
        item.snippet.thumbnails?.default?.url ??
        '',
    }));

    return NextResponse.json<SearchApiResponse>({ videos });
  } catch (err) {
    console.error('[api/youtube/search]', err);
    return NextResponse.json<SearchApiResponse>(
      { videos: [], error: 'Unexpected server error' },
      { status: 500 },
    );
  }
}

/**
 * Parses YouTube ISO 8601 duration (e.g. PT1H2M3S, PT15M33S, PT45S) into mm:ss or hh:mm:ss
 */
export function parseIsoDuration(durationStr: string): string {
  if (!durationStr) return '';
  const regex = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const match = durationStr.match(regex);
  if (!match) return '';

  const days = parseInt(match[1] || '0', 10);
  const hours = parseInt(match[2] || '0', 10) + days * 24;
  const minutes = parseInt(match[3] || '0', 10);
  const seconds = parseInt(match[4] || '0', 10);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
