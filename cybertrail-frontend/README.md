# CyberTrail UI

React + Vite frontend for the CyberTrail financial crime investigation platform.

## Stack
- **React 18** — UI framework
- **Vite** — dev server + bundler
- **Cytoscape.js** — graph visualization engine
- **Zustand** — global state
- **Tailwind CSS** — styling
- **Recharts** — stats charts
- **React Router v6** — routing

## Setup

```bash
# Install dependencies
npm install

# Start dev server (proxies API to localhost:8000)
npm run dev
```

Open http://localhost:3000

## Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | Stats overview + quick module launch |
| `/investigate` | Main investigation workspace with graph |
| `/complaints` | Upload FIR/NCRP CSV data |
| `/blacklist` | Manage OFAC/I4C/internal watchlists |
| `/history` | Recent investigation sessions |

## Environment

The Vite dev server proxies all `/api` requests to `http://localhost:8000`.
Make sure the FastAPI backend is running before starting the UI.

## Build for production

```bash
npm run build
# Output in dist/ — serve with nginx or any static file server
```
