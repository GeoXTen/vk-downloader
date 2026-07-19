# VK Audio Saver

Chrome extension that adds a download button to VK audio tracks with bitrate and file size info.

![Screenshot](screenshot.png)

## Features

- One-click audio download from VK (vk.com / vk.ru)
- Shows bitrate (e.g. `320kbs`) and file size (e.g. `11.40 MB`) in a tooltip
- Works on music tracks and podcast episodes
- Lightweight (~14KB total)

## Install

### From source (developer mode)

1. Clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select this folder

## How it works

- Injects a MAIN world content script into VK pages
- Resolves audio URLs via VK's internal API (`/music` endpoint)
- Decodes VK's custom Base64 URL obfuscation
- Estimates file size using VK's built-in HLS player
- Opens audio in a new tab on click

## Permissions

- `scripting` — inject content script into VK pages
- Host access: `vk.com`, `vk.ru`

## Tech

- Chrome Manifest V3
- Service worker + MAIN world content script
- No external dependencies

## Author

**geonotfounds** — [https://geo.devs.surf/](https://geo.devs.surf/)
