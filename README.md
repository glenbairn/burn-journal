# Burn Journal 🔥

Write down what's weighing on you, then let it go. Press and hold the flame — the page ignites and burns from the bottom up, and a fresh blank page rises in its place.

A private, ephemeral vent journal. Nothing you write is ever saved, sent, or stored.

## Privacy, by design

- **No storage.** No `localStorage`, no `sessionStorage`, no IndexedDB, no cookies. Your words live only in the textarea in RAM and are destroyed when the page burns (or when you close the tab).
- **No network.** The page makes zero requests after load — no analytics, no logging, no backend. The only external request is the Courier Prime font from Google Fonts at page load, which never sees your text. (Delete the two `fonts.googleapis.com` lines in `index.html` if you want zero third-party requests; it falls back to your system monospace font.)
- **No cloud spellcheck.** `spellcheck` is disabled on the textarea so browsers with "enhanced spell check" (which uploads text) never see what you write.
- **Auditable in one sitting.** Three small files of plain HTML/CSS/JS. No build step, no dependencies.

One honest caveat: your OS keyboard (e.g., Gboard/SwiftKey personalization) operates below the web page and this app can't control it. If that matters to you, use your keyboard's incognito mode.

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g., `burn-journal`). Public repos get free Pages hosting.
2. From this folder:

   ```bash
   git init
   git add .
   git commit -m "Burn Journal"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/burn-journal.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)` → Save**.
4. After a minute, your app is live at `https://YOUR_USERNAME.github.io/burn-journal/`.
5. On your phone, open that URL and use **Add to Home Screen** for a full-screen, app-like experience.

## How the burn works

- A layered-sine noise function defines a jagged **burn front** that travels bottom → top over ~2.4 s.
- The paper element is clipped each frame with a `clip-path` polygon that follows the front, so the page genuinely disappears from the bottom up — text and all.
- A canvas overlay, synced to the same noise function, draws the charred band, the flickering ember line, and rising sparks.
- Releasing the flame button before ignition makes the ember fizzle out harmlessly.
- `prefers-reduced-motion` is respected: the page fades instead of burning.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Structure and metadata |
| `style.css` | Dark charcoal app, cream paper, ember accents |
| `app.js` | Hold-to-ignite, burn animation, page renewal |
| `icon.svg`, `manifest.webmanifest` | Home-screen icon and app metadata |
