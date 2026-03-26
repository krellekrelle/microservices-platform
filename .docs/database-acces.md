# Database Access Guide

This project runs PostgreSQL in Docker and exposes it through the `database` service.

## Prerequisites

- Docker and Docker Compose installed
- Services running from the repository root:

```bash
docker compose up -d
```

## Connect to PostgreSQL shell

From the repository root:

```bash
docker compose exec database psql -U app_user -d microservices_platform
```

This opens an interactive `psql` session.

## Run one-off SQL commands

Without opening an interactive shell:

```bash
docker compose exec -T database psql -U app_user -d microservices_platform -c "SELECT now();"
```

## Export training session descriptions to JSON

```bash
docker compose exec -T database psql -U app_user -d microservices_platform -t -A -c "SELECT COALESCE(json_agg(description ORDER BY description),'[]'::json) FROM (SELECT DISTINCT description FROM training_sessions WHERE description IS NOT NULL AND btrim(description) <> '') s;" > training-session-descriptions.json
```

## Useful checks

Count total training sessions:

```bash
docker compose exec -T database psql -U app_user -d microservices_platform -c "SELECT COUNT(*) FROM training_sessions;"
```

Preview first 10 rows:

```bash
docker compose exec -T database psql -U app_user -d microservices_platform -c "SELECT id, user_id, date, type, description FROM training_sessions ORDER BY id DESC LIMIT 10;"
```

## Troubleshooting

If connection fails:

1. Verify container is running:

```bash
docker compose ps database
```

2. Check database logs:

```bash
docker compose logs -f database
```
