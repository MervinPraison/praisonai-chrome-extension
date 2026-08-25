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

## v1.0.3-rejected — do not upload

Kept only so the difference is auditable. `screenshot_1280x800.png` shows the
removed Agent tab, "Start Agent" and "Agent Activity"; both tiles carry
"AI-Powered Browser Automation" and "Automate with Natural Language" baked into
the image. Chrome Web Store policy on false or misleading information covers
imagery, so uploading any of these would re-trigger the original rejection.
