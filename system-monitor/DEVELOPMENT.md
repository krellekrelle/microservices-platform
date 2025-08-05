# System Monitor Service

## Overview

The System Monitor service provides comprehensive system monitoring through Prometheus and Grafana integration. It tracks essential system metrics including CPU, memory, disk, and network usage with real-time visualization.

## Architecture

### Components

1. **Prometheus** - Metrics collection and storage (port 9090 internal)
2. **Grafana** - Visualization and dashboards (port 3000 internal)
3. **Node Exporter** - System metrics collection agent (port 9100 internal)

### No Custom Node.js Service

This service uses a pure infrastructure approach with no custom application code:
- **Prometheus** handles all metrics collection and storage
- **Grafana** provides the web interface and visualization
- **Node Exporter** gathers comprehensive system metrics from the host
- **Configuration-only** - just YAML files, no custom code to maintain

## Access & Authentication

### URL Routes
- **Main Dashboard**: `https://kl-pi.tail9f5728.ts.net/monitor/`
- **Admin Access**: Visible on landing page dashboard for admin users only
- **Grafana Login**: Username `admin`, Password `admin`

### Integration with Platform
- **Admin-only access** through existing JWT authentication system
- **Landing page integration** - "System Monitor" card for admin users
- **Caddy reverse proxy** handles routing with sub-path support

## Configuration

### Prometheus Configuration
- **Location**: `system-monitor/prometheus/prometheus.yml`
- **Scrape interval**: 60 seconds (as requested)
- **Targets**: node-exporter:9100, prometheus:9090
- **Data retention**: 200 hours

### Grafana Configuration
- **Datasources**: Auto-provisioned Prometheus connection
- **Dashboards**: User-created (no pre-provisioned dashboards to avoid conflicts)
- **Sub-path**: Properly configured for `/monitor/` routing
- **Environment**:
  ```yaml
  - GF_SERVER_ROOT_URL=https://kl-pi.tail9f5728.ts.net/monitor/
  - GF_SERVER_SERVE_FROM_SUB_PATH=true
  - GF_SERVER_DOMAIN=kl-pi.tail9f5728.ts.net
  ```

## Metrics Available

### System Metrics from Node Exporter
- **CPU Usage**: Per-core and aggregate CPU utilization
- **Memory Usage**: RAM usage, available memory, swap usage
- **Disk Usage**: Filesystem usage, disk I/O statistics
- **Network Usage**: Interface statistics, bandwidth utilization
- **System Load**: Load averages, process counts
- **Hardware**: Temperature sensors (if available)

### Recommended Dashboards
Import these dashboard IDs from grafana.com:
- **1860**: Node Exporter Full (comprehensive system monitoring)
- **405**: Node Exporter Server Metrics
- **8919**: Node Exporter for Prometheus

## Docker Configuration

### Services in docker-compose.yml
```yaml
prometheus:
  image: prom/prometheus:latest
  # Internal networking only, no exposed ports

grafana:
  image: grafana/grafana:latest
  # Sub-path configuration for /monitor/ routing

node-exporter:
  image: prom/node-exporter:latest
  # Host system access for metrics collection
```

### Network Security
- **No exposed ports** - all services use internal Docker networking
- **Caddy reverse proxy** - single point of external access
- **Admin authentication** - protected by platform's JWT system

## Caddy Routing Configuration

```yaml
# System Monitor routes - preserve /monitor prefix for Grafana sub-path
handle /monitor/* {
    reverse_proxy grafana:3000
}
```

**Key**: Uses `handle` (not `handle_path`) to preserve the `/monitor/` prefix that Grafana expects.

## Development Notes

### Why This Architecture?
- **Industry Standard**: Prometheus + Grafana is the gold standard for monitoring
- **Zero Custom Code**: No maintenance burden, just configuration
- **Proven Reliability**: Battle-tested components used in production worldwide
- **Rich Ecosystem**: Thousands of pre-built dashboards and integrations

### Troubleshooting Common Issues

1. **Dashboard provisioning conflicts**:
   - Remove pre-provisioned dashboards if they cause save issues
   - Create dashboards manually in Grafana UI instead

2. **Sub-path routing issues**:
   - Ensure Caddy uses `handle /monitor/*` (preserves path)
   - Ensure Grafana has `GF_SERVER_SERVE_FROM_SUB_PATH=true`

3. **Prometheus connection issues**:
   - Check datasource URL: `http://prometheus:9090`
   - Verify all containers are on same `app-network`

### Data Persistence
- **Prometheus data**: Stored in `prometheus_data` Docker volume
- **Grafana settings**: Stored in `grafana_data` Docker volume
- **Configuration**: File-based, version controlled

## Future Enhancements

### Potential Additions
- **Application metrics** from microservices (custom /metrics endpoints)
- **Alerting rules** in Prometheus for threshold monitoring
- **Alert notifications** via email/Slack integration
- **Custom dashboards** for business-specific metrics
- **Log aggregation** with Loki integration

### Monitoring Other Services
To add custom metrics from your Node.js services:
1. Install `prom-client` in your services
2. Add `/metrics` endpoints exposing custom metrics
3. Configure Prometheus to scrape these endpoints
4. Create Grafana dashboards for application-specific data

## Quick Start Commands

```bash
# Start all monitoring services
docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs grafana
docker compose logs prometheus
docker compose logs node-exporter

# Restart monitoring stack
docker compose restart grafana prometheus node-exporter
```

## Access URLs

- **Grafana Dashboard**: `https://kl-pi.tail9f5728.ts.net/monitor/`
- **Landing Page (Admin)**: `https://kl-pi.tail9f5728.ts.net/dashboard`
- **Internal Prometheus**: `http://prometheus:9090` (container network only)
- **Internal Node Exporter**: `http://node-exporter:9100` (container network only)
