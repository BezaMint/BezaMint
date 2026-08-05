import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bezamint.vercel.app';

  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/explore`, lastModified: new Date() },
    { url: `${baseUrl}/dashboard`, lastModified: new Date() },
    { url: `${baseUrl}/collections`, lastModified: new Date() },
    { url: `${baseUrl}/mint`, lastModified: new Date() },
    { url: `${baseUrl}/verify`, lastModified: new Date() },
    { url: `${baseUrl}/profile`, lastModified: new Date() },
    { url: `${baseUrl}/settings`, lastModified: new Date() },
  ];
}
