# Limit Social Time Usage — Edge Extension

This extension limits daily usage time for Facebook, Instagram, and any other sites you add.
When the daily limit is reached, tabs will automatically redirect to the site's messaging page
(e.g. `facebook.com/messages`) instead of blocking the page completely.

## Features

- ✅ Track usage time per site with minute-level accuracy
- ✅ Automatically redirect to the messaging page when the daily limit is reached
- ✅ Store all data (settings + daily history) in **IndexedDB** locally — no server upload
- ✅ Change daily limits anytime in the Options page
- ✅ Add/edit/remove social sites and their message URLs
- ✅ View usage charts by **day (last 7 days)**, **week (12 weeks)**, and **month (12 months)** — drawn with canvas, no external chart library

## Project Structure

```
social-time-limiter/
├── manifest.json      # Manifest V3
├── background.js      # Service worker: usage tracking + redirect
├── db.js              # Shared IndexedDB helper module
├── popup.html/.js     # Popup shown when clicking the extension icon
├── options.html/.js   # Management and statistics page
└── icons/             # Icon files: 16/32/48/128px
```

## Install in Microsoft Edge (Developer / Unpacked mode)

1. Unzip the `social-time-limiter` folder somewhere on your computer (do not delete it after installing,
   Edge will load the extension directly from that folder).
2. Open Edge and go to `edge://extensions/`
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `social-time-limiter` folder (the folder containing `manifest.json`).
6. The extension will appear in the toolbar — pin it for easier access.

## Usage

- **Popup** (click the icon): quickly view today's usage for each active tracked site
  with a progress bar showing the daily limit.
- **Management & Statistics page** (open from the popup or right-click the icon →
  "Manage extension"):
  - The **Manage Sites** tab lets you enable/disable sites, edit name, domain, message URL,
    and daily limit directly in the table; changes save automatically. Add new sites using the row at the bottom.
  - The **Statistics** tab lets you choose a site and time range (day/week/month)
    to view a usage chart, plus total/average/highest summary values.

## Default sites

| Site      | Domain        | Default limit    | Messages URL                             |
| --------- | ------------- | ---------------- | ---------------------------------------- |
| Facebook  | facebook.com  | 30 minutes/day   | https://www.facebook.com/messages        |
| Instagram | instagram.com | 30 minutes/day   | https://www.instagram.com/direct/inbox/  |

You can edit or remove these default sites and add as many custom sites as you want
(e.g. TikTok, X/Twitter, YouTube). Just enter the domain and the corresponding messages URL.

## Technical notes

- Usage is counted only when the tracked tab is active and the browser window is focused,
  using the `chrome.tabs` and `chrome.windows` APIs.
- The extension uses `chrome.alarms` with a 1-minute interval because Manifest V3
  service workers can be suspended by the browser — alarms ensure tracking remains accurate while the worker sleeps.
- When daily usage reaches the limit, the extension will `chrome.tabs.update`
  any open tabs for that site to the configured messages URL.
- Data is stored in the extension's IndexedDB (`socialTimeLimiterDB`) locally on your device,
  not synced to your Edge account.
