# Pocket Dial

A Chrome (MV3) new tab extension built for **mobile** browsers that support
extensions — a grid of circular speed-dial favicons with labels and folders,
designed for touch first.

## Features

- **Speed dial grid** — circular tiles with site favicons (Google favicon
  service) and a colored letter-avatar fallback for sites without one.
- **Folders (one level)** — folder tiles preview their contents as a 2×2
  mini-grid of icons. Subfolders are intentionally not supported.
- **Touch-first editing** — tap to open, long-press to edit. All editing
  happens in a bottom sheet; no hover-dependent UI anywhere.
- **Auto-titled entries** — paste a URL and the page title is fetched and
  filled in automatically (you can always edit it).
- **Move to folder** — re-file any link into any folder (or back to the top
  level) from the edit sheet.
- **Custom icons** — override a site's favicon with your own image.
- **Wallpaper** — pick any image from your gallery; it's downscaled and
  stored locally, with a dark scrim behind the dial for readability.
- **Import / export** — one-tap JSON backup of all dials, icons, and
  wallpaper from Settings.
- **Mobile-safe layout** — safe-area insets, 56px touch targets, 4-column
  grid (6 on wide screens), center-weighted content, folder drill-in
  animation.

## Install (unpacked)

1. Download or clone this repo.
2. Open your browser's extension page and enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a new tab.

## Usage

| Gesture | Action |
| --- | --- |
| Tap a tile | Open the link (or enter a folder) |
| Long-press a tile | Open the edit sheet (rename, change URL/icon, move, delete) |
| Right-click a tile | Same as long-press (desktop testing) |
| `+` tile | Add a link or folder |
| Gear icon (top right) | Settings: wallpaper, backup |

Inside a folder the `+` tile only adds links — folders exist only at the
top level.

## Privacy

- Everything is stored locally in `chrome.storage.local`. Nothing is synced
  or sent anywhere by the extension.
- Two things touch the network, both on your behalf only: favicon lookups
  (`google.com/s2/favicons`) and page-title fetching when you paste a URL.
- The `<all_urls>` host permission exists solely to allow that title fetch
  from the new tab page.

## Project structure

```
manifest.json   MV3 manifest (new tab override + storage + host permissions)
newtab.html     Page shell: grid, edit sheet, settings, dialogs
style.css       Dark, mobile-first styles
newtab.js       State, storage, rendering, gestures — vanilla JS, no build step
```

## Development

No build step. Edit the files and reload the extension. Opening
`newtab.html` directly in a desktop browser works as a preview — data falls
back to `localStorage` when `chrome.storage` isn't available.

> Note: `chrome_url_overrides.newtab` works on desktop Chrome and
> Chromium-based Android browsers with extension support. It does **not**
> work on Firefox for Android or Chrome for Android (which doesn't support
> extensions at all).

## License

All rights reserved.
