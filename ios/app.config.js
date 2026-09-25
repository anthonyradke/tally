// APP_VARIANT=development builds "Tally Dev": its own bundle ID, scheme and DEV icon, so it installs next to the
// Release app instead of over it. Both builds get every icon in assets/app-icons/ as an alternate app icon for
// Settings → App icon (named in PascalCase, "ocean-black.png" → "OceanBlack"); Tally Dev's own icon is
// dev-black, and dev-white is its one extra alternate.
/* global __dirname */
const fs = require('fs');
const path = require('path');

const dev = process.env.APP_VARIANT === 'development';
const pascal = (s) => s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const alternates = fs.readdirSync(path.join(__dirname, 'assets/app-icons'))
  .filter((f) => f.endsWith('.png') && (dev ? f !== 'dev-black.png' : !f.startsWith('dev-')))
  .sort()
  .map((f) => ({ name: pascal(f.replace('.png', '')), ios: `./assets/app-icons/${f}` }));

module.exports = ({ config }) => {
  config = { ...config, plugins: [...config.plugins, ['expo-alternate-app-icons', alternates]] };
  if (!dev) return config;
  return {
    ...config,
    name: 'Tally Dev',
    scheme: 'tally-dev',
    icon: './assets/app-icons/dev-black.png',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.anthonyradke.tally.dev',
      icon: './assets/app-icons/dev-black.png',
    },
  };
};
