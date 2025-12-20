# Kenchi Deployment Guide

## Table of Contents

1. [Overview](#overview)
2. [Deployment Options](#deployment-options)
3. [Option 1: Single VM](#option-1-single-vm-developmentsmall-team)
4. [Option 2: Multi-VM with Load Balancer](#option-2-multi-vm-with-load-balancer)
5. [Option 3: Kubernetes](#option-3-kubernetes-eksgkeaks)
6. [Option 4: Serverless](#option-4-serverless-aws-lambda--cloud-functions)
7. [Option 5: Managed Containers](#option-5-managed-container-services-ecscloud-runazure-container-apps)
8. [Scaling Considerations](#scaling-considerations)
9. [n8n Production Setup](#n8n-production-setup)
10. [Comparison Matrix](#comparison-matrix)

---

## Overview

Kenchi is deployed as a set of microservices that work together to provide AI-driven DevOps assistance. The core services are:

| Service    | Port | Purpose                                     |
| ---------- | ---- | ------------------------------------------- |
| API        | 3000 | Central webhook and event ingestion         |
| Slack Bot  | 3001 | Slack integration and bot interactions      |
| GitHub App | 3002 | GitHub webhook handling and PR interactions |
| n8n        | 5678 | Workflow automation and orchestration       |

### User Interaction Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ENTRY POINTS                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Slack Users                        GitHub Users             │
│  ──────────                         ────────────             │
│  • /kenchi commands                 • Push code              │
│  • @mention bot                     • Open PRs               │
│  • Click Approve/Reject             • CI fails → webhook     │
│       │                                    │                 │
│       ▼                                    ▼                 │
│  ┌──────────┐                       ┌──────────────┐         │
│  │Slack Bot │                       │ GitHub App   │         │
│  │ :3001    │                       │ :3002        │         │
│  └────┬─────┘                       └──────┬───────┘         │
│       │                                    │                 │
│       └───────────────┬────────────────────┘                 │
│                       ▼                                      │
│              ┌────────────────┐                              │
│              │   API Service  │ ← LLM Analysis               │
│              │   :3000        │                              │
│              └────────────────┘                              │
│                       │                                      │
│                       ▼                                      │
│              ┌────────────────┐                              │
│              │ n8n Workflows  │ ← Orchestration              │
│              │   :5678        │                              │
│              └────────────────┘                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Options

| Scale       | Users    | Recommended Option            |
| ----------- | -------- | ----------------------------- |
| Development | 1-10     | Single VM with Docker Compose |
| Small       | 10-50    | Single VM with Docker Compose |
| Medium      | 50-500   | Multi-VM or ECS Fargate       |
| Large       | 500-5000 | Kubernetes (EKS/GKE/AKS)      |
| Enterprise  | 5000+    | Kubernetes with multi-region  |

---

## Option 1: Single VM (Development/Small Team)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Single VM (4-8 CPU, 16GB RAM)            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Docker Compose                       │    │
│  │                                                      │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │    │
│  │  │   api    │ │slack-bot │ │github-app│ │  n8n   │ │    │
│  │  │  :3000   │ │  :3001   │ │  :3002   │ │ :5678  │ │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───┬────┘ │    │
│  │       │            │            │           │       │    │
│  │       └────────────┴────────────┴───────────┘       │    │
│  │                         │                            │    │
│  │              ┌──────────▼──────────┐                │    │
│  │              │   Docker Network    │                │    │
│  │              │   kenchi_default    │                │    │
│  │              └─────────────────────┘                │    │
│  │                                                      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                 Nginx Reverse Proxy                  │    │
│  │  • SSL termination (Let's Encrypt)                  │    │
│  │  • Route to services                                 │    │
│  │  • Basic rate limiting                               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  External: Elastic IP / Static IP                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Setup Steps

```bash
# 1. Provision VM (AWS EC2 example)
aws ec2 run-instances \
  --instance-type t3.xlarge \
  --image-id ami-ubuntu-22.04 \
  --key-name your-key \
  --security-group-ids sg-xxx

# 2. Install Docker & Docker Compose
ssh ubuntu@your-vm
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 3. Clone and configure
git clone https://github.com/your-org/kenchi.git
cd kenchi
cp .env.example .env
# Edit .env with production values

# 4. Deploy
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 5. Setup Nginx + SSL
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d kenchi.yourdomain.com
```

### Production Docker Compose Override

```yaml
# docker-compose.prod.yml
version: "3.8"

services:
  api:
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  slack-bot:
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M

  github-app:
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M

  n8n:
    restart: always
    deploy:
      resources:
        limits:
          memory: 2G
    volumes:
      - n8n_data:/home/node/.n8n

  postgres:
    image: postgres:15
    restart: always
    environment:
      POSTGRES_DB: kenchi
      POSTGRES_USER: kenchi
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: always
    volumes:
      - redis_data:/data

volumes:
  n8n_data:
  postgres_data:
  redis_data:
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/kenchi
upstream api {
    server localhost:3000;
}

upstream slack {
    server localhost:3001;
}

upstream github {
    server localhost:3002;
}

upstream n8n {
    server localhost:5678;
}

server {
    listen 443 ssl http2;
    server_name kenchi.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/kenchi.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kenchi.yourdomain.com/privkey.pem;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;

    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /slack/ {
        proxy_pass http://slack/;
        proxy_set_header Host $host;
    }

    location /github/ {
        proxy_pass http://github/;
        proxy_set_header Host $host;
    }

    location /n8n/ {
        proxy_pass http://n8n/;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Cost Estimate

| Provider     | Instance                | Monthly Cost |
| ------------ | ----------------------- | ------------ |
| AWS          | t3.xlarge (4 CPU, 16GB) | ~$120        |
| GCP          | e2-standard-4           | ~$100        |
| Azure        | D4s v3                  | ~$140        |
| DigitalOcean | Premium 4vCPU           | ~$80         |

### Pros & Cons

| Pros           | Cons                               |
| -------------- | ---------------------------------- |
| Simple setup   | Single point of failure            |
| Low cost       | No horizontal scaling              |
| Easy debugging | Limited to one machine's resources |
| Full control   | Manual updates/maintenance         |

### When to Use

- Development/staging environments
- Small teams (<50 users)
- POC/MVP phase
- Budget-constrained projects

---

## Option 2: Multi-VM with Load Balancer

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloud Provider                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        ┌──────────────┐                         │
│                        │   Internet   │                         │
│                        └──────┬───────┘                         │
│                               │                                  │
│                        ┌──────▼───────┐                         │
│                        │     ALB      │                         │
│                        │ (HTTPS:443)  │                         │
│                        └──────┬───────┘                         │
│                               │                                  │
│         ┌─────────────────────┼─────────────────────┐           │
│         │                     │                     │           │
│         ▼                     ▼                     ▼           │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │    VM 1     │      │    VM 2     │      │    VM 3     │     │
│  │  (App Node) │      │  (App Node) │      │  (App Node) │     │
│  │             │      │             │      │             │     │
│  │ • api       │      │ • api       │      │ • api       │     │
│  │ • slack-bot │      │ • slack-bot │      │ • slack-bot │     │
│  │ • github-app│      │ • github-app│      │ • github-app│     │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘     │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                   │
│                       ┌──────▼──────┐                           │
│                       │ Private VPC │                           │
│                       └──────┬──────┘                           │
│                              │                                   │
│    ┌─────────────────────────┼─────────────────────────┐        │
│    │                         │                         │        │
│    ▼                         ▼                         ▼        │
│ ┌──────────┐          ┌──────────┐          ┌──────────┐       │
│ │ Postgres │          │  Redis   │          │   n8n    │       │
│ │ (RDS)    │          │(Elasti-  │          │  VM x2   │       │
│ │          │          │ Cache)   │          │          │       │
│ └──────────┘          └──────────┘          └──────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Terraform Infrastructure (AWS)

```hcl
# infrastructure/aws/main.tf

provider "aws" {
  region = "us-east-1"
}

# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0"

  name = "kenchi-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# Application Load Balancer
resource "aws_lb" "kenchi" {
  name               = "kenchi-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_target_group" "api" {
  name     = "kenchi-api-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = module.vpc.vpc_id

  health_check {
    path                = "/health"
    healthy_threshold   = 2
    unhealthy_threshold = 10
  }
}

# Auto Scaling Group
resource "aws_launch_template" "app" {
  name_prefix   = "kenchi-app-"
  image_id      = data.aws_ami.ubuntu.id
  instance_type = "t3.large"

  user_data = base64encode(<<-EOF
    #!/bin/bash
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker ubuntu

    # Pull and run containers
    docker compose -f /opt/kenchi/docker-compose.yml up -d
  EOF
  )

  vpc_security_group_ids = [aws_security_group.app.id]
}

resource "aws_autoscaling_group" "app" {
  name                = "kenchi-app-asg"
  desired_capacity    = 3
  max_size            = 6
  min_size            = 2
  target_group_arns   = [aws_lb_target_group.api.arn]
  vpc_zone_identifier = module.vpc.private_subnets

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier           = "kenchi-db"
  engine               = "postgres"
  engine_version       = "15"
  instance_class       = "db.t3.medium"
  allocated_storage    = 100
  storage_encrypted    = true

  db_name  = "kenchi"
  username = "kenchi"
  password = var.db_password

  vpc_security_group_ids = [aws_security_group.db.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = 7
  multi_az               = true
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "kenchi-redis"
  engine               = "redis"
  node_type            = "cache.t3.medium"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  security_group_ids   = [aws_security_group.redis.id]
  subnet_group_name    = aws_elasticache_subnet_group.main.name
}
```

### Code Changes Required

#### Distributed Rate Limiting

```typescript
// packages/shared/src/redis.ts
import { createClient } from "redis";
import { config } from "./config.js";
import { createLogger } from "./logger.js";

const logger = createLogger("redis");

export const redis = createClient({
  url: config.REDIS_URL,
});

redis.on("error", (err) => logger.error("Redis error", { error: err }));
redis.on("connect", () => logger.info("Redis connected"));

export const connectRedis = async (): Promise<void> => {
  await redis.connect();
};
```

```typescript
// packages/shared/src/rateLimit.ts
import { redis } from "./redis.js";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

export const createDistributedRateLimiter = (options: RateLimitOptions) => {
  const { windowMs, maxRequests, keyPrefix } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${req.ip}`;

    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, Math.ceil(windowMs / 1000));
    }

    if (current > maxRequests) {
      return res.status(429).json({ error: "Too many requests" });
    }

    next();
  };
};
```

### Cost Estimate

| Component         | Spec                      | Monthly Cost    |
| ----------------- | ------------------------- | --------------- |
| 3x EC2 t3.large   | 2 CPU, 8GB each           | ~$180           |
| ALB               | Application Load Balancer | ~$25            |
| RDS PostgreSQL    | db.t3.medium, Multi-AZ    | ~$150           |
| ElastiCache Redis | cache.t3.medium           | ~$50            |
| 2x n8n VMs        | t3.medium                 | ~$60            |
| NAT Gateway       | Data transfer             | ~$45            |
| **Total**         |                           | **~$510/month** |

### Pros & Cons

| Pros                       | Cons                              |
| -------------------------- | --------------------------------- |
| High availability          | More complex setup                |
| Auto-scaling               | Higher cost                       |
| Managed databases          | Multiple components to manage     |
| No single point of failure | Requires infrastructure knowledge |

### When to Use

- Medium-sized teams (50-500 users)
- Production workloads
- Need for reliability
- Moderate budget available

---

## Option 3: Kubernetes (EKS/GKE/AKS)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                     Ingress Controller                      │     │
│  │              (NGINX / AWS ALB Ingress)                     │     │
│  └───────────────────────────┬────────────────────────────────┘     │
│                              │                                       │
│  ┌───────────────────────────┼───────────────────────────────┐      │
│  │                   Services (ClusterIP)                     │      │
│  │                           │                                │      │
│  │    ┌──────────────────────┼──────────────────────┐        │      │
│  │    │                      │                      │        │      │
│  │    ▼                      ▼                      ▼        │      │
│  │ ┌──────────┐       ┌──────────┐       ┌──────────┐       │      │
│  │ │api-svc   │       │slack-svc │       │github-svc│       │      │
│  │ └────┬─────┘       └────┬─────┘       └────┬─────┘       │      │
│  │      │                  │                  │              │      │
│  └──────┼──────────────────┼──────────────────┼──────────────┘      │
│         │                  │                  │                      │
│  ┌──────┼──────────────────┼──────────────────┼──────────────┐      │
│  │      │      Deployments │                  │              │      │
│  │      ▼                  ▼                  ▼              │      │
│  │ ┌──────────┐      ┌──────────┐      ┌──────────┐         │      │
│  │ │api       │      │slack-bot │      │github-app│         │      │
│  │ │ Pod x3   │      │ Pod x3   │      │ Pod x3   │         │      │
│  │ │ HPA: 3-10│      │ HPA: 3-10│      │ HPA: 2-5 │         │      │
│  │ └──────────┘      └──────────┘      └──────────┘         │      │
│  │                                                           │      │
│  │ ┌──────────┐      ┌──────────┐                           │      │
│  │ │llm-worker│      │n8n       │                           │      │
│  │ │ Pod x5   │      │ Pod x2   │                           │      │
│  │ │ HPA: 5-20│      │queue mode│                           │      │
│  │ └──────────┘      └──────────┘                           │      │
│  │                                                           │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │                    StatefulSets / External                 │      │
│  │                                                            │      │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────────┐    │      │
│  │  │ Postgres │    │  Redis   │    │ Vector DB        │    │      │
│  │  │ (managed)│    │ (managed)│    │ (pgvector/Chroma)│    │      │
│  │  └──────────┘    └──────────┘    └──────────────────┘    │      │
│  │                                                            │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │                    Observability Stack                     │      │
│  │                                                            │      │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐            │      │
│  │  │Prometheus│    │ Grafana  │    │  Loki    │            │      │
│  │  └──────────┘    └──────────┘    └──────────┘            │      │
│  │                                                            │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Kubernetes Manifests

#### Namespace

```yaml
# k8s/base/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: kenchi
```

#### API Deployment

```yaml
# k8s/base/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: kenchi
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: your-registry/kenchi-api:latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          envFrom:
            - secretRef:
                name: kenchi-secrets
            - configMapRef:
                name: kenchi-config
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

#### API Service

```yaml
# k8s/base/api-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: kenchi
spec:
  selector:
    app: api
  ports:
    - port: 3000
      targetPort: 3000
```

#### Horizontal Pod Autoscaler

```yaml
# k8s/base/api-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: kenchi
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

#### LLM Worker Deployment

```yaml
# k8s/base/llm-worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-worker
  namespace: kenchi
spec:
  replicas: 5
  selector:
    matchLabels:
      app: llm-worker
  template:
    metadata:
      labels:
        app: llm-worker
    spec:
      containers:
        - name: llm-worker
          image: your-registry/kenchi-llm-worker:latest
          resources:
            requests:
              memory: "512Mi"
              cpu: "500m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          envFrom:
            - secretRef:
                name: kenchi-secrets
```

#### n8n Deployment (Queue Mode)

```yaml
# k8s/base/n8n-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: n8n
  namespace: kenchi
spec:
  replicas: 2
  selector:
    matchLabels:
      app: n8n
  template:
    metadata:
      labels:
        app: n8n
    spec:
      containers:
        - name: n8n
          image: n8nio/n8n:latest
          ports:
            - containerPort: 5678
          env:
            - name: EXECUTIONS_MODE
              value: "queue"
            - name: QUEUE_BULL_REDIS_HOST
              value: "redis"
            - name: DB_TYPE
              value: "postgresdb"
            - name: DB_POSTGRESDB_HOST
              valueFrom:
                secretKeyRef:
                  name: kenchi-secrets
                  key: DB_HOST
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
```

#### Ingress

```yaml
# k8s/base/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kenchi-ingress
  namespace: kenchi
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
    - hosts:
        - kenchi.yourdomain.com
      secretName: kenchi-tls
  rules:
    - host: kenchi.yourdomain.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 3000
          - path: /slack
            pathType: Prefix
            backend:
              service:
                name: slack-bot
                port:
                  number: 3001
          - path: /github
            pathType: Prefix
            backend:
              service:
                name: github-app
                port:
                  number: 3002
          - path: /n8n
            pathType: Prefix
            backend:
              service:
                name: n8n
                port:
                  number: 5678
```

### Helm Values

```yaml
# kenchi-helm/values.yaml
global:
  imageRegistry: your-registry
  imagePullPolicy: Always

api:
  replicaCount: 3
  image:
    repository: kenchi-api
    tag: latest
  resources:
    requests:
      memory: 256Mi
      cpu: 250m
    limits:
      memory: 512Mi
      cpu: 500m
  hpa:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPU: 70

slackBot:
  replicaCount: 3
  image:
    repository: kenchi-slack-bot
    tag: latest

githubApp:
  replicaCount: 2
  image:
    repository: kenchi-github-app
    tag: latest

llmWorker:
  replicaCount: 5
  image:
    repository: kenchi-llm-worker
    tag: latest
  hpa:
    enabled: true
    minReplicas: 5
    maxReplicas: 20
    targetCPU: 60

n8n:
  replicaCount: 2
  queueMode: true
  resources:
    limits:
      memory: 2Gi

redis:
  enabled: false
  external:
    host: redis.xxx.cache.amazonaws.com
    port: 6379

postgresql:
  enabled: false
  external:
    host: kenchi.xxx.rds.amazonaws.com
    port: 5432
    database: kenchi

ingress:
  enabled: true
  className: nginx
  host: kenchi.yourdomain.com
  tls:
    enabled: true
    secretName: kenchi-tls
```

### LLM Worker Service

```typescript
// services/llm-worker/src/index.ts
import { Queue, Worker } from "bullmq";
import { createLogger, config } from "@kenchi/shared";
import { processAnalysisJob } from "./jobs/analysisJob.js";

const logger = createLogger("llm-worker");

const connection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
};

const worker = new Worker(
  "llm-analysis",
  async (job) => {
    logger.info("Processing job", { jobId: job.id, type: job.name });

    switch (job.name) {
      case "analyze-incident":
        return processAnalysisJob(job.data);
      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

worker.on("completed", (job) => {
  logger.info("Job completed", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  logger.error("Job failed", { jobId: job?.id, error: err.message });
});

logger.info("LLM Worker started");
```

### Cost Estimate

| Component                    | Spec                  | Monthly Cost      |
| ---------------------------- | --------------------- | ----------------- |
| EKS Cluster                  | Control plane         | ~$75              |
| 3x t3.large nodes (app)      | 2 CPU, 8GB each       | ~$180             |
| 3x t3.xlarge nodes (workers) | 4 CPU, 16GB           | ~$360             |
| RDS PostgreSQL               | db.r5.large, Multi-AZ | ~$300             |
| ElastiCache Redis            | cache.r5.large        | ~$150             |
| ALB Ingress                  | Load balancer         | ~$25              |
| ECR                          | Container registry    | ~$10              |
| CloudWatch                   | Logs & metrics        | ~$50              |
| **Total**                    |                       | **~$1,150/month** |

### Pros & Cons

| Pros                 | Cons                   |
| -------------------- | ---------------------- |
| Auto-scaling (HPA)   | Complex setup          |
| Self-healing pods    | Steep learning curve   |
| Rolling deployments  | Higher base cost       |
| GitOps ready         | Requires K8s expertise |
| Multi-region capable | Operational overhead   |

### When to Use

- Large teams (500-5000+ users)
- Enterprise requirements
- Multi-region deployment
- High availability requirements
- DevOps team with K8s experience

---

## Option 4: Serverless (AWS Lambda / Cloud Functions)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Serverless Architecture                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                      API Gateway                            │     │
│  │            (REST API + WebSocket for Slack)                │     │
│  └───────────────────────────┬────────────────────────────────┘     │
│                              │                                       │
│         ┌────────────────────┼────────────────────┐                 │
│         │                    │                    │                 │
│         ▼                    ▼                    ▼                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │   Lambda    │     │   Lambda    │     │   Lambda    │           │
│  │  api-handler│     │slack-handler│     │github-handler│          │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘           │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                        │
│                      ┌──────▼──────┐                                │
│                      │    SQS      │                                │
│                      │   Queue     │                                │
│                      └──────┬──────┘                                │
│                             │                                        │
│                      ┌──────▼──────┐                                │
│                      │   Lambda    │                                │
│                      │ llm-worker  │                                │
│                      │ Timeout: 5m │                                │
│                      └──────┬──────┘                                │
│                             │                                        │
│    ┌────────────────────────┼────────────────────────┐              │
│    │                        │                        │              │
│    ▼                        ▼                        ▼              │
│ ┌──────────┐         ┌──────────┐         ┌──────────┐             │
│ │ Aurora   │         │ElastiCache│        │DynamoDB  │             │
│ │Serverless│         │  Redis    │        │ (events) │             │
│ └──────────┘         └──────────┘         └──────────┘             │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                     Step Functions                          │     │
│  │              (Replaces n8n for workflows)                  │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### AWS SAM Template

```yaml
# template.yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: Kenchi Serverless

Globals:
  Function:
    Timeout: 30
    Runtime: nodejs20.x
    MemorySize: 512
    Environment:
      Variables:
        NODE_ENV: production
        REDIS_URL: !GetAtt RedisCluster.RedisEndpoint.Address

Resources:
  KenchiApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod

  ApiFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: services/api/
      Handler: dist/lambda.handler
      Events:
        Api:
          Type: Api
          Properties:
            RestApiId: !Ref KenchiApi
            Path: /api/{proxy+}
            Method: ANY
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref EventsTable
        - SQSSendMessagePolicy:
            QueueName: !GetAtt AnalysisQueue.QueueName

  SlackFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: services/slack-bot/
      Handler: dist/lambda.handler
      Timeout: 10
      Events:
        SlackWebhook:
          Type: Api
          Properties:
            RestApiId: !Ref KenchiApi
            Path: /slack/{proxy+}
            Method: POST

  GithubFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: services/github-app/
      Handler: dist/lambda.handler
      Events:
        GithubWebhook:
          Type: Api
          Properties:
            RestApiId: !Ref KenchiApi
            Path: /github/webhook
            Method: POST

  LlmWorkerFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: services/llm-worker/
      Handler: dist/lambda.handler
      Timeout: 300
      MemorySize: 1024
      ReservedConcurrentExecutions: 100
      Events:
        SQSEvent:
          Type: SQS
          Properties:
            Queue: !GetAtt AnalysisQueue.Arn
            BatchSize: 1

  AnalysisQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: kenchi-analysis-queue
      VisibilityTimeout: 360
      MessageRetentionPeriod: 86400

  EventsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: kenchi-events
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: id
          AttributeType: S
      KeySchema:
        - AttributeName: id
          KeyType: HASH
```

### Step Functions Workflow (Replaces n8n)

```json
{
  "Comment": "Incident Analysis Workflow",
  "StartAt": "NormalizeEvent",
  "States": {
    "NormalizeEvent": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:${Region}:${Account}:function:kenchi-api",
      "Parameters": {
        "action": "normalize",
        "event.$": "$"
      },
      "Next": "CollectEvidence"
    },
    "CollectEvidence": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "FetchLogs",
          "States": {
            "FetchLogs": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:${Region}:${Account}:function:kenchi-api",
              "Parameters": {
                "action": "fetchLogs",
                "eventId.$": "$.eventId"
              },
              "End": true
            }
          }
        },
        {
          "StartAt": "FetchMetrics",
          "States": {
            "FetchMetrics": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:${Region}:${Account}:function:kenchi-api",
              "Parameters": {
                "action": "fetchMetrics",
                "eventId.$": "$.eventId"
              },
              "End": true
            }
          }
        }
      ],
      "Next": "AnalyzeWithLLM"
    },
    "AnalyzeWithLLM": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:${Region}:${Account}:function:kenchi-llm-worker",
      "TimeoutSeconds": 300,
      "Next": "CheckConfidence"
    },
    "CheckConfidence": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.confidence",
          "NumericGreaterThan": 0.8,
          "Next": "NotifyWithAutoActions"
        }
      ],
      "Default": "NotifyWithApproval"
    },
    "NotifyWithAutoActions": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:${Region}:${Account}:function:kenchi-slack",
      "End": true
    },
    "NotifyWithApproval": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:${Region}:${Account}:function:kenchi-slack",
      "End": true
    }
  }
}
```

### Lambda Handler

```typescript
// services/api/src/lambda.ts
import type {
  APIGatewayProxyHandler,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from "aws-lambda";
import { app } from "./app.js";
import serverlessExpress from "@vendia/serverless-express";

const serverlessApp = serverlessExpress({ app });

export const handler: APIGatewayProxyHandler = async (
  event: APIGatewayProxyEvent,
  context
): Promise<APIGatewayProxyResult> => {
  return serverlessApp(event, context);
};
```

### Cost Estimate

| Component           | Usage Assumption       | Monthly Cost    |
| ------------------- | ---------------------- | --------------- |
| Lambda (API)        | 1M requests, 500ms avg | ~$20            |
| Lambda (LLM Worker) | 100K requests, 30s avg | ~$150           |
| API Gateway         | 1M requests            | ~$35            |
| SQS                 | 1M messages            | ~$1             |
| DynamoDB            | 10GB, on-demand        | ~$25            |
| Aurora Serverless   | 10 ACU avg             | ~$100           |
| Step Functions      | 100K executions        | ~$25            |
| ElastiCache         | cache.t3.small         | ~$25            |
| **Total**           |                        | **~$380/month** |

### Pros & Cons

| Pros                  | Cons                     |
| --------------------- | ------------------------ |
| Pay-per-use           | Cold start latency       |
| Auto-scales to zero   | 15-min Lambda timeout    |
| No server management  | Complex debugging        |
| Built-in HA           | Vendor lock-in           |
| Low cost at low scale | Different dev experience |

### When to Use

- Variable/unpredictable traffic
- Cost-sensitive projects
- Small ops team
- Event-driven workloads
- Already on AWS ecosystem

---

## Option 5: Managed Container Services (ECS/Cloud Run/Azure Container Apps)

### Architecture (AWS ECS Fargate)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ECS Fargate Cluster                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                Application Load Balancer                    │     │
│  └───────────────────────────┬────────────────────────────────┘     │
│                              │                                       │
│  ┌───────────────────────────┼───────────────────────────────┐      │
│  │                    ECS Services                            │      │
│  │                           │                                │      │
│  │    ┌──────────────────────┼──────────────────────┐        │      │
│  │    │                      │                      │        │      │
│  │    ▼                      ▼                      ▼        │      │
│  │ ┌──────────┐       ┌──────────┐       ┌──────────┐       │      │
│  │ │api       │       │slack-bot │       │github-app│       │      │
│  │ │Service   │       │Service   │       │Service   │       │      │
│  │ │Tasks: 3  │       │Tasks: 3  │       │Tasks: 2  │       │      │
│  │ │CPU: 512  │       │CPU: 512  │       │CPU: 256  │       │      │
│  │ │Mem: 1GB  │       │Mem: 1GB  │       │Mem: 512MB│       │      │
│  │ └──────────┘       └──────────┘       └──────────┘       │      │
│  │                                                           │      │
│  │ ┌──────────┐       ┌──────────┐                          │      │
│  │ │llm-worker│       │n8n       │                          │      │
│  │ │Service   │       │Service   │                          │      │
│  │ │Tasks: 5  │       │Tasks: 2  │                          │      │
│  │ │CPU: 1024 │       │CPU: 1024 │                          │      │
│  │ │Mem: 2GB  │       │Mem: 4GB  │                          │      │
│  │ └──────────┘       └──────────┘                          │      │
│  │                                                           │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │                    Shared Resources                        │      │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐            │      │
│  │  │   RDS    │    │ElastiCache│   │   ECR    │            │      │
│  │  │ Postgres │    │  Redis    │   │ Registry │            │      │
│  │  └──────────┘    └──────────┘    └──────────┘            │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Terraform for ECS

```hcl
# infrastructure/ecs/main.tf

resource "aws_ecs_cluster" "kenchi" {
  name = "kenchi-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "kenchi-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${aws_ecr_repository.api.repository_url}:latest"

      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" }
      ]

      secrets = [
        {
          name      = "OPENAI_API_KEY"
          valueFrom = "${aws_secretsmanager_secret.kenchi.arn}:OPENAI_API_KEY::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/kenchi-api"
          awslogs-region        = var.region
          awslogs-stream-prefix = "api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "kenchi-api"
  cluster         = aws_ecs_cluster.kenchi.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 3
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 10
  min_capacity       = 3
  resource_id        = "service/${aws_ecs_cluster.kenchi.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "kenchi-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}
```

### Cost Estimate

| Component               | Spec              | Monthly Cost    |
| ----------------------- | ----------------- | --------------- |
| ECS Fargate (API 3x)    | 0.5 vCPU, 1GB     | ~$75            |
| ECS Fargate (Slack 3x)  | 0.5 vCPU, 1GB     | ~$75            |
| ECS Fargate (GitHub 2x) | 0.25 vCPU, 0.5GB  | ~$25            |
| ECS Fargate (LLM 5x)    | 1 vCPU, 2GB       | ~$200           |
| ECS Fargate (n8n 2x)    | 1 vCPU, 4GB       | ~$120           |
| ALB                     | Load balancer     | ~$25            |
| RDS PostgreSQL          | db.t3.medium      | ~$75            |
| ElastiCache Redis       | cache.t3.small    | ~$25            |
| ECR                     | Container storage | ~$5             |
| **Total**               |                   | **~$625/month** |

### Pros & Cons

| Pros                   | Cons                           |
| ---------------------- | ------------------------------ |
| Simpler than K8s       | Less flexible than K8s         |
| Managed infrastructure | AWS-specific                   |
| Auto-scaling built-in  | Limited to container workloads |
| Good AWS integration   | Debugging can be harder        |
| No cluster management  | Vendor lock-in                 |

### When to Use

- Medium to large deployments
- Teams familiar with AWS but not K8s
- Want containers without K8s complexity
- Already invested in AWS ecosystem

---

## Scaling Considerations

### Latency Breakdown

| Component           | Latency    | Scalable?  | Solution              |
| ------------------- | ---------- | ---------- | --------------------- |
| Webhook ingestion   | ~10ms      | Yes        | Add more instances    |
| Evidence collection | 2-10s      | Yes        | Parallel fetching     |
| **LLM API call**    | **15-25s** | Bottleneck | Queue + async workers |
| Vector DB query     | 50-200ms   | Yes        | Read replicas         |
| Slack/GitHub API    | 100-500ms  | Yes        | Async posting         |

### The LLM Bottleneck

The LLM API call is the primary bottleneck. Solution: async processing with message queue.

```
Synchronous (Bad):
User 1 ──► LLM ──► 20s wait
User 2 ──► LLM ──► 20s wait (queued)
User 3 ──► LLM ──► 20s wait (queued)

Asynchronous (Good):
User 1 ──► Queue ──► Worker 1 ──► LLM ──► Slack notification
User 2 ──► Queue ──► Worker 2 ──► LLM ──► Slack notification
User 3 ──► Queue ──► Worker 3 ──► LLM ──► Slack notification
                     (parallel)
```

---

## n8n Production Setup

### Current Issues at Scale

1. Single instance by default
2. SQLite storage doesn't scale
3. Memory-heavy per workflow execution
4. Not designed for high-throughput

### Production Configuration

```yaml
# n8n with queue mode
n8n:
  environment:
    - EXECUTIONS_MODE=queue
    - QUEUE_BULL_REDIS_HOST=redis
    - DB_TYPE=postgresdb
    - DB_POSTGRESDB_HOST=postgres
  deploy:
    replicas: 3
```

### Alternatives for High Scale

| Approach               | Pros                             | Cons             |
| ---------------------- | -------------------------------- | ---------------- |
| **Keep n8n**           | Visual workflows, easy to modify | Limited scale    |
| **BullMQ + Redis**     | Fast, proven at scale            | Code-only, no UI |
| **Temporal.io**        | Enterprise-grade workflows       | Complex setup    |
| **AWS Step Functions** | Serverless, auto-scale           | Vendor lock-in   |

---

## Comparison Matrix

| Aspect             | Single VM | Multi-VM   | Kubernetes | Serverless    | ECS Fargate |
| ------------------ | --------- | ---------- | ---------- | ------------- | ----------- |
| **Cost (small)**   | $120      | $510       | $1,150     | $50           | $400        |
| **Cost (medium)**  | N/A       | $800       | $1,500     | $380          | $625        |
| **Cost (large)**   | N/A       | N/A        | $3,000+    | $1,000+       | $1,500+     |
| **Complexity**     | Low       | Medium     | High       | Medium        | Medium      |
| **Scaling**        | None      | Manual     | Auto (HPA) | Auto          | Auto        |
| **HA**             | None      | Yes        | Yes        | Yes           | Yes         |
| **Learning curve** | Low       | Low        | High       | Medium        | Medium      |
| **Vendor lock-in** | None      | Low        | Low        | High          | Medium      |
| **n8n support**    | Native    | Native     | Queue mode | Replace       | Native      |
| **Best for**       | Dev/POC   | Small prod | Enterprise | Variable load | Mid-size    |

---

## Quick Start Commands

### Single VM

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
kubectl apply -k k8s/overlays/production
# or with Helm
helm install kenchi ./kenchi-helm -f values-production.yaml
```

### Serverless

```bash
sam build && sam deploy --guided
```

### ECS

```bash
terraform init && terraform apply
```

---

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture overview
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) - Detailed component design
- [DATA_MODELS.md](./DATA_MODELS.md) - Data structures and schemas

---

**Document Version**: 1.0
**Last Updated**: 2025-12-20
