# Development

The [README](../README.md) covers running the backend and the app in Expo Go. This page covers the two other ways
to run the app, the checks, and releases.

## Standalone build on a phone

With a free Apple ID, run `npx expo prebuild --platform ios` once, pick a Personal Team
under Signing & Capabilities in `ios/ios/Tally.xcworkspace`, then run
`npx expo run:ios --device --configuration Release` with the phone connected. Trust the profile on the phone under
Settings › General › VPN & Device Management. Re-running the same command reinstalls over the old copy and keeps
cached data and queued entries.

## Browser preview

For layout work without a phone, `npx expo start --web --port 8082` plus `node scripts/preview.mjs` serves the web
build and the API from one origin on `http://127.0.0.1:8090`. `API_PORT=8001` points it at a backend running on a
copy of the database.

## Checks

These run on every push to `main` (`.github/workflows/check.yml`) and should pass before a commit:

```sh
uv run ruff check . && uv run pytest -q      # backend, including tests/test_contract.py (needs ios/node_modules)
cd ios && npm test && npm run typecheck && npx expo lint
```

`tests/test_contract.py` seeds a demo database and checks every API answer against the types in `ios/src/lib/api.ts`.

## Releases

Versions follow semver and are logged in `CHANGELOG.md`. A release sets the same number in `pyproject.toml`,
`ios/app.json` and `ios/package.json` (then `uv lock` and `npm install` to update the lock files), and is tagged
`vX.Y.Z`. The app shows the version it was built with in Settings, so a phone only shows a new number after a rebuild.
