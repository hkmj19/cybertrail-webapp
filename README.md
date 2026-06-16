# CyberTrail - Financial Crime Investigation Platform

An open-source graph intelligence tool built for Indian law enforcement agencies.
Investigators can trace cryptocurrency wallets, UPI fraud chains, shell company networks, and social communication graphs - all visualised as an interactive node-link graph.

Developed as part of a cybersecurity internship project for the Cybercrime Police Station, Amroha (UP Police).

---

## What It Does

| Module | What You Can Trace |
|--------|--------------------|
| **Crypto Tracer** | Bitcoin, Ethereum, TRON wallet addresses - follows transaction hops to find connected wallets |
| **UPI / Bank Fraud** | UPI IDs, phone numbers, bank accounts - maps mule account chains from complaint data |
| **Shell Company** | Company CIN, Director DIN - uncovers beneficial ownership and struck-off companies via MCA21 |
| **Social Graph** | Phone numbers / UPI IDs - builds communication networks and detects fraud hubs |
| **Multi-Layer** | Combines all four above into one unified investigation graph |

---

## Tech Stack

### Backend
| Technology | Role |
|------------|------|
| Python 3.11+ | Core language |
| FastAPI | REST API framework |
| Neo4j 5.19 | Graph database - stores all investigation graphs |
| Redis 7.2 | Caching - avoids repeated external API calls |
| NetworkX | In-memory graph analysis (centrality, community detection) |
| python-jose | JWT authentication |
| bcrypt | Password hashing |
| cryptography | AES-256 backup encryption (Fernet) |
| slowapi | Rate limiting (100 req/min per IP, login lockout after 10 failures) |
| loguru | Structured logging with sensitive data masking |

### Frontend
| Technology | Role |
|------------|------|
| React 18 | UI framework |
| Vite 5 | Dev server and bundler |
| Cytoscape.js | Interactive graph visualisation |
| Zustand | Global state management |
| Tailwind CSS | Styling |
| Recharts | Dashboard charts |
| React Router v6 | Page routing |
| Axios | HTTP client (proxied to backend) |

### External APIs Used
| API | Purpose | Free Tier |
|-----|---------|-----------|
| Etherscan | Ethereum wallet and transaction data | Yes - etherscan.io |
| BlockCypher | Bitcoin wallet and transaction data | Yes - blockcypher.com |
| TronGrid | TRON / USDT wallet data | Yes - trongrid.io |
| MCA21 (India) | Company and director registration data | Public - no key needed |

> The app works without API keys - crypto tracing returns empty graphs. UPI/Shell/Social modules use your uploaded complaint CSVs and Neo4j data.

---

## Prerequisites

Install all three before setup:

1. **Docker Desktop** - runs Neo4j (graph database) and Redis (cache)
   - Download: https://www.docker.com/products/docker-desktop
   - Start Docker Desktop after installing and wait for it to show "Running"

2. **Python 3.11 or higher**
   - Download: https://www.python.org/downloads/
   - Check: `python --version`

3. **Node.js 18 or higher**
   - Download: https://nodejs.org/
   - Check: `node --version`

---

## Project Structure

```
cyber-trail-webapp/
├── .gitignore                   ← protects .env, node_modules, backups from git
│
├── cybertrail-backend/          ← FastAPI Python backend
│   ├── app/
│   │   ├── main.py              ← App entry point, router registration, CORS
│   │   ├── core/
│   │   │   ├── config.py        ← All settings loaded from .env
│   │   │   ├── database.py      ← Neo4j async connection manager
│   │   │   ├── cache.py         ← Redis cache manager
│   │   │   ├── auth.py          ← JWT FastAPI dependencies
│   │   │   └── logger.py        ← Structured logging + sensitive data masking
│   │   ├── models/
│   │   │   ├── graph.py         ← GraphNode, GraphEdge, InvestigationGraph models
│   │   │   └── auth.py          ← User, Role, Case, Token Pydantic models
│   │   ├── modules/
│   │   │   ├── crypto/tracer.py ← BTC/ETH/TRON wallet tracer (Etherscan, BlockCypher, TronGrid)
│   │   │   ├── upi/tracer.py    ← UPI fraud chain tracer (complaint CSV + Neo4j)
│   │   │   ├── shell/tracer.py  ← Shell company tracer (MCA21 + Neo4j)
│   │   │   ├── social/tracer.py ← Phone/UPI social network tracer (NetworkX)
│   │   │   └── multi/combiner.py← Merges all 4 modules into one graph
│   │   ├── services/
│   │   │   ├── graph_service.py ← Neo4j graph persistence and queries
│   │   │   ├── risk_service.py  ← Risk scoring engine (11 signals, 0-100 score)
│   │   │   ├── blacklist_service.py ← Internal + OFAC + I4C blacklist management
│   │   │   ├── auth_service.py  ← User CRUD + JWT + bcrypt
│   │   │   ├── audit_service.py ← Immutable audit log (append-only AuditLog nodes)
│   │   │   ├── case_service.py  ← Case CRUD (Neo4j Case nodes + HAS_NOTE + HAS_TRACE)
│   │   │   └── (backup is in api/routes/backup.py)
│   │   └── api/routes/          ← One file per module
│   │       ├── auth.py          ← Login, refresh, user management
│   │       ├── crypto.py, upi.py, shell.py, social.py, multi.py
│   │       ├── cases.py         ← Case management with FIR duplicate detection
│   │       ├── blacklist.py     ← Blacklist CRUD + bulk CSV import + OFAC sync
│   │       ├── complaints.py    ← Complaint upload and listing
│   │       ├── graph.py         ← Graph load, expand, flag entity
│   │       ├── audit.py         ← Audit trail viewer
│   │       └── backup.py        ← Export/import/restore + factory reset
│   ├── tests/                   ← pytest test suite
│   ├── scripts/seed_neo4j.cypher← Sample data loader
│   ├── docker-compose.yml       ← Neo4j + Redis containers
│   ├── requirements.txt         ← Python dependencies
│   ├── .env.example             ← Config template (copy → .env and fill in keys)
│   └── Makefile                 ← Dev shortcuts (make dev, make seed, make test)
│
└── cybertrail-frontend/         ← React + Vite frontend
    ├── src/
    │   ├── pages/               ← One file per page (Dashboard, Investigate, Cases, etc.)
    │   ├── components/          ← Reusable UI (SearchBar, Graph, ui.jsx primitives)
    │   ├── hooks/               ← useTrace, useEntitySearch
    │   ├── services/api.js      ← Axios API client (all backend calls)
    │   └── store/useStore.js    ← Zustand global state
    ├── index.html
    ├── vite.config.js           ← Dev server port 3000, proxies /api → localhost:8000
    └── package.json
```

---

## Setup - Step by Step

You need **3 terminal windows** open simultaneously. Follow in order.

---

### Terminal 1 - Start Databases

```bash
cd cybertrail-backend
docker-compose up -d
```

This starts:
- **Neo4j** at http://localhost:7474 (browser UI, login: `neo4j` / `cybertrail123`)
- **Redis** at `localhost:6379`

Wait 10–15 seconds for Neo4j to fully start before the next step.

To stop later: `docker-compose down`
To wipe all data and restart fresh: `docker-compose down -v && docker-compose up -d`

---

### Terminal 2 - Start Backend API

```bash
cd cybertrail-backend

# First time only - install Python packages
pip install -r requirements.txt

# First time only - create your config file
cp .env.example .env
```

Open `.env` in any text editor and fill in your API keys:

```env
ETHERSCAN_API_KEY=your_key_here        # free at etherscan.io
BLOCKCYPHER_API_KEY=your_key_here      # free at blockcypher.com
TRONGRID_API_KEY=your_key_here         # free at trongrid.io

# Change this before going live!
BACKUP_ENCRYPTION_PASSWORD=your_strong_password_here

# Generate a proper JWT secret (paste the output):
# python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=paste_generated_key_here
```

Then start the server:

```bash
uvicorn app.main:app --reload
```

API running at **http://localhost:8000**
- Interactive API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

---

### Terminal 3 - Start Frontend UI

```bash
cd cybertrail-frontend

# First time only
npm install

# Start dev server
npm run dev
```

Frontend running at **http://localhost:3000**

---

### All Three at a Glance

| Terminal | Directory | Command | URL |
|----------|-----------|---------|-----|
| 1 | `cybertrail-backend/` | `docker-compose up -d` | Neo4j: http://localhost:7474 |
| 2 | `cybertrail-backend/` | `uvicorn app.main:app --reload` | API: http://localhost:8000 |
| 3 | `cybertrail-frontend/` | `npm run dev` | UI: http://localhost:3000 |

---

## Default Login

A default admin account is auto-created on first startup:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `Admin@123` |

**Change this password immediately after first login** via the profile page.

---

## User Roles

| Role | What they can do |
|------|-----------------|
| **Admin** | Full access - create/delete users, reset any password, factory reset, view all audit logs |
| **Supervisor** | View all cases, assign/close cases, sync OFAC list, export backups |
| **Officer** | Create cases, run investigations, upload CSV data, add to blacklist |
| **Analyst** | Read-only - view graphs, reports, cases assigned to them |

---

## Loading Sample Data

To seed Neo4j with sample investigation records for testing and demos:

```bash
cd cybertrail-backend
make seed
```

Or manually:
```bash
docker exec -i cybertrail_neo4j cypher-shell -u neo4j -p cybertrail123 < scripts/seed_neo4j.cypher
```

---

## API Endpoints

Full interactive docs at **http://localhost:8000/docs**

### Authentication
```
POST /api/v1/auth/login                Login → returns JWT access + refresh tokens
POST /api/v1/auth/refresh              Get new access token using refresh token
GET  /api/v1/auth/me                   Current user info
PUT  /api/v1/auth/me/password          Change own password (invalidates session)
GET  /api/v1/auth/users                List all users (Supervisor+)
POST /api/v1/auth/users                Create user account (Admin only)
PUT  /api/v1/auth/users/{id}           Update user role/status (Admin only)
PUT  /api/v1/auth/users/{id}/reset-password   Admin resets any user's password
DELETE /api/v1/auth/users/{id}         Delete user (Admin only)
```

### Investigation
```
POST /api/v1/crypto/trace              Trace BTC / ETH / TRON wallet
POST /api/v1/upi/trace                 Trace UPI ID / phone / bank account
POST /api/v1/upi/ingest-csv            Upload complaint CSV (FIR / NCRP export)
POST /api/v1/upi/ingest-bank-transfers Upload bank transfer CSV (Section 91 CrPC)
POST /api/v1/upi/link-accounts         Manually link two accounts
POST /api/v1/shell/trace               Trace company CIN / director DIN
POST /api/v1/social/trace              Trace phone number social network
POST /api/v1/multi/trace               Combined multi-layer trace
```

### Cases
```
GET  /api/v1/cases/stats               Dashboard stats
GET  /api/v1/cases/                    List cases (role-filtered)
POST /api/v1/cases/                    Create case (checks duplicate FIR number)
GET  /api/v1/cases/{id}                Full case with notes + traces
PUT  /api/v1/cases/{id}                Update case (status rules enforced)
DELETE /api/v1/cases/{id}              Delete case
POST /api/v1/cases/{id}/notes          Add investigation note
POST /api/v1/cases/{id}/traces         Save trace result to case
PUT  /api/v1/cases/{id}/assign         Reassign to different officer (Supervisor+)
```

### Blacklist / Watchlist
```
GET  /api/v1/blacklist/check/{id}      Check against all blacklists (no auth needed)
GET  /api/v1/blacklist/list            Browse all entries with filters
GET  /api/v1/blacklist/stats           Count per list source
POST /api/v1/blacklist/add             Add to internal blacklist (Officer+)
PUT  /api/v1/blacklist/{id}            Update severity/reason (Officer+)
DELETE /api/v1/blacklist/all           Delete all internal entries (Admin only)
DELETE /api/v1/blacklist/{id}          Remove one entry (Officer+)
POST /api/v1/blacklist/import-csv      Bulk import I4C/NCRP CSV (Officer+)
POST /api/v1/blacklist/sync-ofac       Sync OFAC SDN sanctions list (Supervisor+)
```

### Backup & Recovery
```
GET  /api/v1/backup/export             Full backup - encrypted .ct.enc file (Supervisor+)
GET  /api/v1/backup/export/incremental Last N hours only (Supervisor+)
GET  /api/v1/backup/status             DB stats + last backup timestamp
POST /api/v1/backup/restore            Restore from .ct.enc / .json.gz / .json (Admin only)
POST /api/v1/backup/factory-reset      DANGER: wipe all data (system admin only, needs confirm phrase)
```

### Audit Trail
```
GET  /api/v1/audit                     All audit log entries (Supervisor+)
```

### System
```
GET  /health                           API liveness check
GET  /api/v1/status                    Neo4j + Redis connectivity status
```

---

## Risk Scoring

Every entity gets a 0–100 risk score computed from these signals:

| Signal | Points |
|--------|--------|
| NCRP complaint reference | +30 |
| Mule passthrough pattern (receive → forward 80%+ in 24h) | +25 |
| Appears in 5+ complaints | +25 |
| Crypto mixer interaction | +20 |
| Flagged in 2+ investigation modules | +20 |
| Account under 30 days old at time of fraud | +20 |
| Company struck-off but still transacting | +20 |
| Multiple UPI IDs on one phone | +15 |
| Company not filing annual returns | +15 |
| High graph centrality (hub node) | +15 |
| Director on 10+ companies simultaneously | +10 |

| Score | Risk Level |
|-------|------------|
| 50 + | HIGH - immediate action recommended |
| 25–49 | MEDIUM - warrants further investigation |
| 10–24 | LOW - monitor |
| 0–9 | CLEAN |

---

## Backup & Restore

Backups are AES-256 encrypted using the `BACKUP_ENCRYPTION_PASSWORD` from `.env`.

```bash
# Trigger full backup via API (returns .ct.enc encrypted file)
GET http://localhost:8000/api/v1/backup/export

# Restore from backup (dry_run=true just validates without writing)
POST http://localhost:8000/api/v1/backup/restore
  ?dry_run=true

# Recommended: daily incremental backup (last 24 hours only)
GET http://localhost:8000/api/v1/backup/export/incremental?since_hours=24
```

Keep your `BACKUP_ENCRYPTION_PASSWORD` safe - without it, the `.ct.enc` file cannot be decrypted.

---

## Makefile Shortcuts (Backend)

```bash
make install      # pip install -r requirements.txt
make docker-up    # start Neo4j + Redis containers
make docker-down  # stop containers
make dev          # start docker + uvicorn together
make seed         # load sample data into Neo4j
make test         # run pytest
make lint         # run ruff linter
make clean        # remove __pycache__, .pyc, logs
make logs         # tail live log file
```

---

## Running Tests

```bash
cd cybertrail-backend

# Full test suite
pytest tests/ -v

# Skip slow integration tests
pytest tests/ -v -m "not integration"

# With coverage report
pytest tests/ --cov=app --cov-report=html
```

---

## Live Hosting Notes

For deploying as a live website accessible to multiple police stations:

1. **Set strong secrets in `.env`:**
   ```env
   APP_ENV=production
   JWT_SECRET_KEY=<64-char random hex>       # python -c "import secrets; print(secrets.token_hex(32))"
   BACKUP_ENCRYPTION_PASSWORD=<strong password>
   NEO4J_PASSWORD=<change from default>
   ```

2. **Frontend** - build a static bundle and serve via nginx:
   ```bash
   cd cybertrail-frontend
   npm run build            # output goes to dist/
   # serve dist/ with nginx or any static server
   ```

3. **Backend** - use multiple workers in production:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
   ```

4. **Access control** - the system uses invite-only accounts. Only Admin can create new user accounts. There is no self-registration. Officers need to contact admin for login credentials.

5. **HTTPS** - use nginx as a reverse proxy with an SSL certificate (Let's Encrypt / certbot).

---

## Troubleshooting

### "Connection refused" when backend starts
Neo4j takes 10–15 seconds to fully start. Wait and try again:
```bash
docker ps    # check cybertrail_neo4j and cybertrail_redis are running
```

### Neo4j browser login fails
Default credentials set in `docker-compose.yml`: username `neo4j`, password `cybertrail123`

### Frontend shows "Network Error"
Make sure the backend is running at `http://localhost:8000` before starting frontend.

### `pip install` fails on bcrypt or cryptography (Windows)
```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

### Port 8000 already in use
```bash
netstat -ano | findstr :8000
# Or change port:
uvicorn app.main:app --reload --port 8001
```

### Crypto traces return no data
Check that your API keys are set in `.env`. The app skips API calls silently when keys are missing or set to placeholder values.

### Backup restore fails with "wrong password"
The `BACKUP_ENCRYPTION_PASSWORD` in your `.env` must match the one used when the backup was created. If you changed it, the old backup cannot be decrypted.

---

## Built With

- [FastAPI](https://fastapi.tiangolo.com/) - Python async web framework
- [Neo4j](https://neo4j.com/) - Native graph database
- [Redis](https://redis.io/) - In-memory cache
- [React](https://react.dev/) - Frontend framework
- [Cytoscape.js](https://cytoscape.org/) - Graph visualisation
- [NetworkX](https://networkx.org/) - Graph analysis algorithms
- [Docker](https://www.docker.com/) - Container runtime

---

## Security

- Passwords hashed with bcrypt (cost factor 12)
- JWT tokens expire after 60 minutes; refresh tokens after 24 hours
- Token version invalidation: changing role or disabling account immediately logs out the user
- Login brute-force protection: IP locked for 15 minutes after 10 failed attempts
- All modifications logged to immutable AuditLog nodes in Neo4j
- Backup files AES-256 encrypted with PBKDF2 key derivation
- Sensitive data (wallets, phones, UPI IDs) partially masked in all log output
- API rate limited: 100 requests/minute per IP

---

## License

Open-source. Built for law enforcement and educational use.
Not intended for use outside authorized investigations.
