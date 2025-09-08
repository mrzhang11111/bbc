/* eslint-disable no-console, no-restricted-syntax, no-await-in-loop, @typescript-eslint/no-shadow */
// 基于 anigo-anime-api 的视频源获取模块
interface AnigoVideoSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  referer: string;
  provider: string;
}

// Helper functions from anigo-anime-api
function encodeString(str: string): string {
  return btoa(str);
}

async function decodeStreamingLinkAnimix(url: string): Promise<string> {
  try {
    console.log(`尝试解码流媒体链接: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.log(`解码响应失败: ${response.status} ${response.statusText}`);
      return '';
    }

    const data = await response.text();
    console.log(`解码响应长度: ${data.length} 字符`);

    // 尝试提取实际的视频URL
    const urlMatch = data.match(/https?:\/\/[^"'\s]+\.(m3u8|mp4)[^"'\s]*/);
    if (urlMatch) {
      console.log(`找到视频URL: ${urlMatch[0]}`);
      return urlMatch[0];
    }

    console.log('未找到有效的视频URL');
    return '';
  } catch (error) {
    console.error('解码流媒体链接时出错:', error);
    return '';
  }
}

// 从 AnimixPlay 获取视频源
async function getAnimixPlaySources(
  animeName: string,
  episode: number
): Promise<AnigoVideoSource[]> {
  const sources: AnigoVideoSource[] = [];

  try {
    console.log(`尝试从 AnimixPlay 获取: ${animeName} 第 ${episode} 集`);

    // 构造 episode ID (基于 anigo-anime-api 的逻辑)
    const episodeId = `${animeName
      .split(' ')
      .join('-')
      .toLowerCase()}-episode-${episode}`;
    const animeId = episodeId.split('-').reverse().slice(2).reverse().join('-');

    console.log(`构造的 animeId: ${animeId}`);
    console.log(`构造的 episodeId: ${episodeId}`);

    const animixBase = 'https://animixplay.to/';
    const url = `${animixBase}v1/${animeId}`;

    console.log(`请求 AnimixPlay URL: ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    console.log(
      `AnimixPlay 响应状态: ${response.status} ${response.statusText}`
    );

    if (response.ok) {
      const html = await response.text();
      console.log(`AnimixPlay 响应长度: ${html.length} 字符`);

      // 提取 episode list (简化版本)
      const epListMatch = html.match(/id="epslistplace"[^>]*>([^<]+)</);
      if (epListMatch) {
        console.log('找到 episode list 数据');
        try {
          const epList = JSON.parse(epListMatch[1]);
          console.log(`Episode list 包含 ${Object.keys(epList).length} 个条目`);

          let episodeGogoLink: string;

          if (epList.extra && epList.extra[episode]) {
            episodeGogoLink = `https:${epList.extra[episode]}`;
            console.log(`从 extra 找到第 ${episode} 集: ${episodeGogoLink}`);
          } else if (epList[episode - 1]) {
            episodeGogoLink = `https:${epList[episode - 1]}`;
            console.log(`从主列表找到第 ${episode} 集: ${episodeGogoLink}`);
          } else {
            console.log(
              `未找到第 ${episode} 集，可用集数: ${Object.keys(epList)}`
            );
            return sources;
          }

          // 处理链接
          let liveApiLink: string;
          if (episodeGogoLink.includes('player.html')) {
            liveApiLink = episodeGogoLink;
            console.log('使用直接播放器链接');
          } else {
            const urlObj = new URL(episodeGogoLink);
            const contentId = urlObj.searchParams.get('id');
            if (contentId) {
              liveApiLink = `https://animixplay.to/api/cW9${encodeString(
                `${contentId}LTXs3GrU8we9O${encodeString(contentId)}`
              )}`;
              console.log(`构造 API 链接: ${liveApiLink}`);
            } else {
              console.log('无法从 URL 提取 content ID');
              return sources;
            }
          }

          // 获取实际的流媒体链接
          const streamUrl = await decodeStreamingLinkAnimix(liveApiLink);

          if (streamUrl) {
            let quality = 'auto';
            let isM3U8 = false;

            if (streamUrl.includes('.m3u8')) {
              isM3U8 = true;
              quality = 'hls';
            } else if (streamUrl.includes('.mp4')) {
              quality = 'mp4';
            }

            sources.push({
              url: streamUrl,
              quality,
              isM3U8,
              referer: 'https://animixplay.to/',
              provider: 'animixplay',
            });

            console.log(
              `AnimixPlay 成功添加源: ${quality} - ${streamUrl.substring(
                0,
                100
              )}...`
            );
          } else {
            console.log('未能获取有效的流媒体URL');
          }
        } catch (parseError) {
          console.error('解析 episode list 时出错:', parseError);
        }
      } else {
        console.log('未找到 episode list 数据');
      }
    } else {
      console.log(`AnimixPlay 请求失败: ${response.status}`);
    }
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      console.error('AnimixPlay 请求超时');
    } else {
      console.error('获取 AnimixPlay 源时出错:', error);
    }
  }

  return sources;
}

// 从 GogoAnime 获取视频源 (使用 anigo-anime-api 的方法)
async function getGogoAnimeSources(
  animeName: string,
  episode: number
): Promise<AnigoVideoSource[]> {
  const sources: AnigoVideoSource[] = [];

  try {
    console.log(`尝试从 GogoAnime 获取: ${animeName} 第 ${episode} 集`);

    // 构造 GogoAnime episode ID
    const episodeId = `${animeName
      .split(' ')
      .join('-')
      .toLowerCase()}-episode-${episode}`;
    console.log(`GogoAnime episodeId: ${episodeId}`);

    // 尝试多个 GogoAnime 镜像
    const gogoMirrors = [
      'https://gogoanime.pe',
      'https://gogoanime.cl',
      'https://gogoanime.lu',
      'https://anitaku.pe',
    ];

    for (const mirror of gogoMirrors) {
      try {
        const url = `${mirror}/${episodeId}`;
        console.log(`尝试 GogoAnime 镜像: ${url}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        console.log(`${mirror} 响应状态: ${response.status}`);

        if (response.ok) {
          const html = await response.text();
          console.log(`${mirror} 响应长度: ${html.length} 字符`);

          // 提取视频链接
          const m3u8Matches = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g);
          const mp4Matches = html.match(/https?:\/\/[^"'\s]+\.mp4[^"'\s]*/g);

          if (m3u8Matches) {
            console.log(`找到 ${m3u8Matches.length} 个 M3U8 源`);
            m3u8Matches.forEach((videoUrl) => {
              sources.push({
                url: videoUrl,
                quality: 'hls',
                isM3U8: true,
                referer: mirror,
                provider: 'gogoanime',
              });
            });
          }

          if (mp4Matches) {
            console.log(`找到 ${mp4Matches.length} 个 MP4 源`);
            mp4Matches.forEach((videoUrl) => {
              sources.push({
                url: videoUrl,
                quality: 'mp4',
                isM3U8: false,
                referer: mirror,
                provider: 'gogoanime',
              });
            });
          }

          if (sources.length > 0) {
            console.log(`${mirror} 成功找到 ${sources.length} 个源`);
            break; // 找到源就停止尝试其他镜像
          } else {
            console.log(`${mirror} 未找到视频源`);
          }
        }
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          console.error(`${mirror} 请求超时`);
        } else {
          console.error(`${mirror} 出错:`, error);
        }
      }
    }
  } catch (error) {
    console.error('获取 GogoAnime 源时出错:', error);
  }

  return sources;
}

// 主要的 Anigo 视频源获取函数
export async function getAnigoVideoSources(
  animeName: string,
  episode: number
): Promise<AnigoVideoSource[]> {
  console.log(`使用 Anigo API 获取视频源: ${animeName} 第 ${episode} 集`);

  const allSources: AnigoVideoSource[] = [];

  // 并行获取多种来源的视频
  console.log('开始并行获取 AnimixPlay 和 GogoAnime 源...');
  const [animixSources, gogoSources] = await Promise.all([
    getAnimixPlaySources(animeName, episode),
    getGogoAnimeSources(animeName, episode),
  ]);

  console.log(`AnimixPlay 返回 ${animixSources.length} 个源`);
  console.log(`GogoAnime 返回 ${gogoSources.length} 个源`);

  allSources.push(...animixSources, ...gogoSources);

  // 去重
  const uniqueSources = allSources.filter(
    (source, index, self) =>
      index === self.findIndex((s) => s.url === source.url)
  );

  console.log(`去重后剩余 ${uniqueSources.length} 个源`);

  // 优先选择 M3U8 格式
  uniqueSources.sort((a, b) => {
    if (a.isM3U8 && !b.isM3U8) return -1;
    if (!a.isM3U8 && b.isM3U8) return 1;
    return 0;
  });

  console.log(`Anigo API 最终返回 ${uniqueSources.length} 个视频源`);
  uniqueSources.forEach((source, index) => {
    console.log(
      `源 ${index + 1}: ${source.provider} - ${
        source.quality
      } - ${source.url.substring(0, 100)}...`
    );
  });

  return uniqueSources;
}
