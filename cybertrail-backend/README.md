# CyberTrail — Financial Crime Investigation Platform

Open-source graph intelligence tool for Indian law enforcement agencies.
Traces crypto wallets, UPI fraud chains, shell companies, and social networks.

## Tech Stack
- **Backend**: Python 3.11+, FastAPI, Neo4j (graph DB), Redis (cache)
- **APIs used**: Etherscan, BlockCypher, TronGrid, MCA21 (India)
- **Graph engine**: NetworkX (analysis), Neo4j (storage & querying)

## Quick Start
```bash
pip install -r requirements.txt
cp .env.example .env          # fill in your API keys
docker-compose up -d          # starts Neo4j + Redis
uvicorn app.main:app --reload
```

## API docs
Visit http://localhost:8000/docs after starting the server.
