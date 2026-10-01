/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false,
    // The sender libraries talk raw SMTP / IMAP; keep them out of the bundle.
    serverComponentsExternalPackages: ["nodemailer", "imapflow", "mailparser"],
  },
};

module.exports = nextConfig;
