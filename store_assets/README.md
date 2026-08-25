# Store assets

**Upload everything in `v1.0.4/`. Nothing in `v1.0.3-rejected/`.**

## v1.0.4 — current

| File | Size | Notes |
| --- | --- | --- |
| `screenshot_01-run-javascript_1280x800.png` | 1280×800 | Run JavaScript returning the real page title |
| `screenshot_02-extract-data_1280x800.png` | 1280×800 | Extract Data returning real page JSON |
| `screenshot_03-screenshot_1280x800.png` | 1280×800 | A capture shown in the panel with its Save link |
| `screenshot_04-history_1280x800.png` | 1280×800 | The History tab after those actions |
| `small_promo_tile_440x280.jpg` | 440×280 | Required |
| `marquee_promo_tile_1400x560.jpg` | 1400×560 | Optional |

The screenshots are genuine captures of the built extension driving a live
`example.com`, produced by `compose.mjs` — the left half is the real page, the
right half is the real side panel, at the proportions Chrome docks them.
Nothing is mocked up. Regenerate with:

```bash
npm run build
node store_assets/compose.mjs
```

## The rejected assets are gone

The screenshot and tiles that accompanied the rejected submission used to sit in
`store_assets/v1.0.3-rejected/`. They have been deleted: the screenshot showed the
removed Agent tab, and both tiles had "AI-Powered Browser Automation" and
"Automate with Natural Language" baked into the image. Keeping publicly-rendered
copies in a repository the store listing links to was itself a liability. They
remain recoverable from git history if ever needed.
