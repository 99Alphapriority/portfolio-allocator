# Portfolio Allocator — Deployment Guide

A PWA (Progressive Web App) that tracks your Wealthsimple portfolio allocation vs your targets.
Works offline, saves data locally, and installs on your iPhone home screen.

---

## Deploy to GitHub Pages (Free, ~5 minutes)

### Step 1 — Create a GitHub account
Go to https://github.com and sign up if you don't have one.

### Step 2 — Create a new repository
1. Click the **+** icon → **New repository**
2. Name it: `portfolio-allocator`
3. Set to **Public**
4. Click **Create repository**

### Step 3 — Upload files
1. Click **uploading an existing file** (link in the empty repo page)
2. Drag ALL these files into the upload area:
   - `index.html`
   - `app.js`
   - `sw.js`
   - `manifest.json`
   - `icons/icon-192.png`
   - `icons/icon-512.png`
3. For the icons, first create the `icons/` folder by typing `icons/icon-192.png`
   in the filename field — GitHub will auto-create the folder.
4. Click **Commit changes**

### Step 4 — Enable GitHub Pages
1. Go to your repo → **Settings** → **Pages** (left sidebar)
2. Under **Source**, select **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Click **Save**

### Step 5 — Get your URL
After ~1 minute, your app will be live at:
```
https://YOUR-USERNAME.github.io/portfolio-allocator/
```

---

## Add to iPhone Home Screen

1. Open your app URL in **Safari** on iPhone
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down → tap **"Add to Home Screen"**
4. Tap **Add**

The app now appears as an icon on your home screen and opens fullscreen like a native app.

---

## How it works

- **Targets** are saved automatically as you type
- **Holdings CSV** is saved after each upload — reopening the app restores your last session
- Works **offline** after first visit (service worker caches all assets)
- All data stays **on your device** — nothing is sent to any server

---

## Monthly workflow

1. Open app on iPhone
2. In Wealthsimple: Activity → Export → Download CSV
3. Tap **Upload CSV** in the app
4. See your drift and Buy/Sell/Hold signals instantly
