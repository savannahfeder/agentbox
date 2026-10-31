// WHERE AGENTBOX CLOUD IS, FOR EVERY COPY OF THE APP: the Mac download, the
// npm package and a GitHub checkout alike, so each offers the cloud. All three
// values are public: the server's address, and the database's address and its
// anon key, which Supabase issues to be shipped inside apps (row level
// security guards the data). cloud/cloud.public.json,
// ~/.agentbox/cloud.public.json or a release's baked package.json still point
// a copy at another cloud (main/cloud/config.mjs cloudAccountConfig).
export const CLOUD_ADDRESS = Object.freeze({
  gateway: 'https://ob5zqpdpqy4ewdan6inzpbjpxi0nurue.lambda-url.us-east-1.on.aws',
  supabaseUrl: 'https://lywvthwkhkfzhqivvond.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5d3Z0aHdraGtmemhxaXZ2b25kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Mjg5NDYsImV4cCI6MjEwNjQwNDk0Nn0.ZL4sL5ZJ6KC-EcTpbzLAeuOTgoEftF8f7xfaRvXY5kY', // public-check: allow (Supabase's public anon key, role "anon")
});

// The web app phones open, which signs in to that same database. Only for a
// copy signed in to it: another team's cloud has its own site or none.
export const PHONE_SITE = 'https://agentbox-phone.pages.dev';
