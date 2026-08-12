/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // Web login/signup removed Aug 2026 — accounts are created in the iOS app.
    // Old links from search engines and shared URLs land on the marketing page.
    return [
      { source: '/login', destination: '/', permanent: false },
      { source: '/signup', destination: '/', permanent: false },
      { source: '/app', destination: '/', permanent: false },
      { source: '/app/:path*', destination: '/', permanent: false },
    ];
  },
};

module.exports = nextConfig;
