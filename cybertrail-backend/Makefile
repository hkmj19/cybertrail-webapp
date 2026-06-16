# Makefile - CyberTrail development commands
# Usage: make <target>
# Requires: Python 3.11+, Docker, pip

.PHONY: help install dev test lint clean docker-up docker-down seed logs

# ── Default target ────────────────────────────────────────
help:
	@echo ""
	@echo "  CyberTrail - available commands"
	@echo "  ──────────────────────────────────────────"
	@echo "  make install     Install Python dependencies"
	@echo "  make docker-up   Start Neo4j + Redis via Docker"
	@echo "  make docker-down Stop Docker services"
	@echo "  make dev         Start API in development mode (hot reload)"
	@echo "  make seed        Load sample investigation data into Neo4j"
	@echo "  make test        Run full test suite"
	@echo "  make test-fast   Run tests skipping slow integration tests"
	@echo "  make lint        Run ruff linter"
	@echo "  make clean       Remove __pycache__, .pyc files, logs"
	@echo "  make logs        Tail the application log"
	@echo ""

# ── Setup ─────────────────────────────────────────────────
install:
	pip install -r requirements.txt
	@echo "✓ Dependencies installed."

# ── Docker ────────────────────────────────────────────────
docker-up:
	docker-compose up -d
	@echo "✓ Neo4j running at http://localhost:7474 (user: neo4j / pass: cybertrail123)"
	@echo "✓ Redis running at localhost:6379"
	@sleep 5

docker-down:
	docker-compose down
	@echo "✓ Services stopped."

docker-reset:
	# WARNING: Destroys all Neo4j and Redis data
	docker-compose down -v
	docker-compose up -d
	@echo "✓ Services reset - all data cleared."

# ── Development server ────────────────────────────────────
dev: docker-up
	mkdir -p logs
	cp -n .env.example .env 2>/dev/null || true
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# ── Database seeding ──────────────────────────────────────
seed: docker-up
	@echo "Seeding Neo4j with sample investigation data..."
	docker exec cybertrail_neo4j cypher-shell \
		-u neo4j -p cybertrail123 \
		--file /scripts/seed_neo4j.cypher 2>/dev/null || \
	cat scripts/seed_neo4j.cypher | docker exec -i cybertrail_neo4j \
		cypher-shell -u neo4j -p cybertrail123
	@echo "✓ Sample data loaded. Open http://localhost:7474 to browse."

# ── Testing ───────────────────────────────────────────────
test:
	pytest tests/ -v --tb=short

test-fast:
	pytest tests/ -v --tb=short -m "not integration"

test-coverage:
	pytest tests/ --cov=app --cov-report=html --cov-report=term-missing
	@echo "Coverage report: htmlcov/index.html"

test-watch:
	# Requires: pip install pytest-watch
	ptw tests/ app/ -- -v

# ── Code quality ──────────────────────────────────────────
lint:
	# Requires: pip install ruff
	ruff check app/ tests/
	@echo "✓ Lint passed."

format:
	# Requires: pip install ruff black
	ruff format app/ tests/
	@echo "✓ Code formatted."

# ── Utilities ─────────────────────────────────────────────
logs:
	tail -f logs/cybertrail_*.log

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	find . -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	rm -rf htmlcov/ .coverage
	@echo "✓ Cleaned."

# ── Production ────────────────────────────────────────────
prod:
	uvicorn app.main:app \
		--host 0.0.0.0 \
		--port 8000 \
		--workers 4 \
		--log-level info

# ── API docs shortcut ─────────────────────────────────────
docs:
	@echo "Opening API docs..."
	open http://localhost:8000/docs 2>/dev/null || xdg-open http://localhost:8000/docs
