// APP_VARIANT=development builds "Tally Dev": its own bundle ID, scheme and orange icon, so it installs
// next to the Release app instead of over it. Without it, app.json is used as-is.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config;
  return {
    ...config,
    name: 'Tally Dev',
    scheme: 'tally-dev',
    icon: './assets/icon-dev.png',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.anthonyradke.tally.dev',
      icon: {
        light: './assets/icon-dev.png',
        dark: './assets/icon-dev-dark.png',
        tinted: './assets/icon-tinted.png',
      },
    },
  };
};
