# Local QA: the app on the Android emulator, across screen sizes

Pairs with `backend/api/scripts/local-qa` (API on :8795 with a fake Instagram and seeded data). Uses Expo Go on the
`Medium_Phone_API_36.1` emulator; `EXPO_PUBLIC_API_URL` in `.env` must be `http://localhost:8795`.

```sh
scripts/local-qa/metro.sh                   # clean Metro + open the app (restart after edits: the watcher misses them)
scripts/local-qa/matrix.sh small-large      # pick a matrix cell
scripts/local-qa/capture.sh social 6 1 1180 # Social tab (index 1), tab bar at y=1180 for this size
python3 scripts/local-qa/ui.py              # list on-screen elements and tap points
scripts/local-qa/matrix.sh reset            # always restore the emulator afterwards
```

## The Android matrix

| Cell | Size | Notes |
|---|---|---|
| `small` | 320 x 569 dp | budget phones |
| `small-large` | 320 dp, font 1.3x | worst case |
| `standard` / `standard-large` | 360 dp, font 1.0x / 1.3x | |
| `default` | 411 dp | the AVD as shipped |
| `tablet` / `tablet-landscape` | 800 x 1280 dp / 1280 x 800 dp | the app is portrait-only, but Android 16 ignores that on large screens |

Also check: long usernames, product names and captions; 7-digit rupee amounts; keyboard on form screens; bottom sheets.

**iOS is not covered.** It needs a real iPhone with Expo Go, or Xcode's simulator. Do not mark a screen as working on
iOS until it has been tested there.

Tab bar y positions used so far: 2267 (default), 2300 (standard-large), 1180 (small, small-large), 2438 (tablet).
Screenshots go to `mobile/.local-qa/shots/`, which git ignores.
