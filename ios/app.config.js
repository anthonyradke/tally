// Every icon in assets/app-icons/ becomes an alternate app icon for Settings → App icon (named in PascalCase,
// "ocean-black.png" → "OceanBlack").
/* global __dirname */
const fs = require('fs');
const path = require('path');

const pascal = (s) => s.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const alternates = fs.readdirSync(path.join(__dirname, 'assets/app-icons'))
  .filter((f) => f.endsWith('.png'))
  .sort()
  .map((f) => ({ name: pascal(f.replace('.png', '')), ios: `./assets/app-icons/${f}` }));

module.exports = ({ config }) => ({ ...config, plugins: [...config.plugins, ['expo-alternate-app-icons', alternates]] });
