# Marsad Infrastructure as Code — AWS eu-central-1

Production-grade Terraform configuration for deploying Marsad SaaS platform to AWS.

**Status:** ✅ Ready for Deployment  
**Region:** eu-central-1 (Frankfurt, Germany)  
**Architecture:** Multi-AZ, Auto-scaling, Zero-downtime  

---

## 📋 Quick Start

### 1. Prerequisites

```bash
# Install Terraform 1.0+
terraform --version

# Install AWS CLI v2
aws --version

# Configure AWS credentials
aws configure

# Set AWS profile if not default
export AWS_PROFILE=your-profile
```

### 2. Initialize Terraform

```bash
cd infrastructure/terraform

# Initialize backend and download providers
terraform init

# Verify configuration
terraform validate
```

### 3. Create Deployment Variables

```bash
# Copy example to production config
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
nano terraform.tfvars
```

**Critical variables to set:**
- `ssl_certificate_arn` — AWS Certificate Manager ARN for your domain
- `web_container_image` — ECR URI for Next.js frontend
- `api_container_image` — ECR URI for NestJS backend
- `worker_container_image` — ECR URI for BullMQ worker
- `s3_cors_origins` — Your domain (e.g., `https://marsad.example.com`)
- `alarm_sns_topic_arn` — (Optional) SNS topic for CloudWatch alarms

### 4. Review and Deploy

```bash
# Show infrastructure plan
terraform plan -out=tfplan

# Review changes carefully
terraform show tfplan

# Apply to AWS (creates real resources)
terraform apply tfplan

# Save outputs
terraform output > outputs.json
```

---

## 🏗️ Architecture Overview

### VPC & Networking
- **VPC CIDR:** 10.0.0.0/16
- **Public Subnets:** 2 AZs (ALB, NAT Gateways)
- **Private Subnets:** 2 AZs (ECS tasks)
- **Database Subnets:** 2 AZs (RDS, isolated from internet)
- **VPC Endpoints:** S3, ECR, Secrets Manager, CloudWatch Logs (cost optimization)

### Load Balancing
- **Application Load Balancer (ALB)** — HTTP to HTTPS redirect
- **Target Group** — Health checks every 30s, sticky sessions enabled
- **Auto-scaling** — 2–10 containers based on CPU/Memory

### Compute (ECS Fargate)
- **Cluster:** 2+ Fargate tasks, 1+ Spot (cost optimization)
- **Services:**
  - API: 512 CPU / 1 GB memory, port 3000
  - Web: 256 CPU / 512 MB memory, port 3001
  - Worker: 512 CPU / 1 GB memory (BullMQ, no public port)
- **Health Checks:** Container-level + ALB-level
- **Logging:** CloudWatch Logs, 90-day retention

### Database (RDS PostgreSQL)
- **Instance:** db.t3.small (dev/staging); scale to db.r6i.large (prod)
- **Storage:** 100 GB initial, auto-scales to 500 GB
- **Multi-AZ:** Synchronous standby failover
- **Backups:** Daily, 14-day retention + Point-in-time recovery
- **Monitoring:** Enhanced metrics, CloudWatch alarms
- **Encryption:** At-rest (KMS) + in-transit (TLS)
- **Access:** Private subnets, security group isolation

### Cache (ElastiCache Redis)
- **Nodes:** 2x cache.t3.small (Multi-AZ)
- **Replication:** Automatic failover enabled
- **Auth:** Redis AUTH token, TLS encryption
- **Persistence:** Snapshots every 24h, 5-day retention
- **Logging:** CloudWatch Logs (slow-log + engine-log)
- **Monitoring:** CPU, memory, connection alarms

### Storage (S3)
- **Bucket:** Private, versioning enabled, encryption enabled
- **CORS:** Configured for your domain
- **Lifecycle:** Documents → Standard-IA after 90 days
- **Logging:** Access logs to separate bucket
- **Access:** Presigned URLs, IAM roles, no public access

### Container Registry (ECR)
- **Repositories:** 3 (web, api, worker)
- **Scanning:** Vulnerability scan on push
- **Cleanup:** Keep last 10 tagged images, remove untagged after 7 days

### Monitoring & Logging
- **CloudWatch Logs:** ECS, RDS, ALB (90-day retention)
- **Metrics:** CPU, memory, connections, disk, latency
- **Alarms:** 5XX errors, response time, database metrics
- **Dashboard:** Custom dashboard with key metrics
- **SNS:** Alarm notifications (if topic ARN provided)

---

## 📦 What Gets Created

### Network Resources
- 1 VPC, 6 subnets (public/private/database × 2 AZs)
- 2 NAT Gateways + Elastic IPs
- Internet Gateway + Route tables
- 5 VPC Endpoints (S3, ECR API, ECR DKR, Secrets, Logs)
- Security groups (ALB, ECS, RDS, ElastiCache)

### Compute Resources
- ECS Cluster with Fargate capacity providers
- 3 Task Definitions (Web, API, Worker)
- 2 Services (API, Worker) with auto-scaling
- Application Load Balancer + Target Group

### Data Resources
- RDS PostgreSQL instance (Multi-AZ)
- ElastiCache Redis cluster (Multi-AZ)
- S3 bucket + logging bucket
- ECR repositories (3)

### Security & Monitoring
- IAM roles (ECS task execution, task role, RDS monitoring)
- CloudWatch Log Groups (4)
- CloudWatch Alarms (8+)
- Secrets Manager (app secrets)
- CloudWatch Dashboard

**Total estimated cost (monthly):**
- Dev/Staging: $200–300
- Production: $600–1,000 (scales with traffic)

---

## 🚀 Deployment Steps

### Phase 1: Infrastructure Provisioning (30–45 min)

```bash
# 1. Deploy infrastructure
terraform apply

# 2. Get outputs
ALB_DNS=$(terraform output -raw alb_dns_name)
RDS_ENDPOINT=$(terraform output -raw rds_endpoint)
REDIS_ENDPOINT=$(terraform output -raw redis_endpoint)
S3_BUCKET=$(terraform output -raw s3_bucket_name)

echo "ALB: $ALB_DNS"
echo "Database: $RDS_ENDPOINT"
echo "Cache: $REDIS_ENDPOINT"
echo "Storage: $S3_BUCKET"
```

### Phase 2: Container Images (build & push)

```bash
# Get AWS account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=eu-central-1

# Login to ECR
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Build images
cd ../../.. # Back to marsd root

# Build Web image
docker build -t marsad-web:latest -f Dockerfile.web .
docker tag marsad-web:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/marsad-web:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/marsad-web:latest

# Build API image
docker build -t marsad-api:latest -f Dockerfile.api .
docker tag marsad-api:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/marsad-api:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/marsad-api:latest

# Build Worker image
docker build -t marsad-worker:latest -f Dockerfile.worker .
docker tag marsad-worker:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/marsad-worker:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/marsad-worker:latest
```

### Phase 3: Database Initialization

```bash
# Connect to RDS (requires bastion host or RDS Proxy)
psql postgresql://$DB_USER:$DB_PASSWORD@$RDS_ENDPOINT:5432/$DB_NAME

# Run migrations
\i backend/migrations/001_initial_schema.sql
\i backend/migrations/002_rls_policies.sql

# Seed demo data (optional)
\i backend/seeds/demo_data.sql
```

### Phase 4: Deploy to ECS

```bash
# Update task definitions with image URIs
aws ecs update-service \
  --cluster marsad-cluster \
  --service marsad-api \
  --force-new-deployment

aws ecs update-service \
  --cluster marsad-cluster \
  --service marsad-worker \
  --force-new-deployment

# Monitor deployment
aws ecs describe-services \
  --cluster marsad-cluster \
  --services marsad-api marsad-worker
```

### Phase 5: Domain Setup

```bash
# Point your domain to ALB
# In DNS provider: CNAME yourdomain.com → $ALB_DNS

# Verify SSL certificate (should auto-validate if in ACM)
aws acm describe-certificate \
  --certificate-arn $SSL_CERT_ARN \
  --region $REGION
```

---

## 📊 Monitoring & Maintenance

### Daily Checks

```bash
# Check service health
aws ecs describe-services \
  --cluster marsad-cluster \
  --services marsad-api marsad-worker

# Check database status
aws rds describe-db-instances \
  --db-instance-identifier marsad-postgres

# Check Redis status
aws elasticache describe-replication-groups \
  --replication-group-id marsad-redis
```

### CloudWatch Dashboard

Open AWS Console → CloudWatch → Dashboards → `marsad-dashboard`

Monitor:
- ALB response time (target: <300ms P95)
- ECS CPU/memory usage
- RDS connections and storage
- Redis memory and connections

### Scaling Rules

- **CPU-based:** Scale up at 70% CPU, down at 30%
- **Memory-based:** Scale up at 80% memory, down at 50%
- **Manual scaling:** `aws ecs update-service --desired-count N`

---

## 🔐 Security Best Practices

✅ **Implemented:**
- All data in private subnets, no public IPs
- Security groups with least-privilege rules
- RLS in PostgreSQL for multi-tenant isolation
- Encryption at rest (KMS) and in transit (TLS)
- IAM roles scoped to minimal permissions
- Secrets Manager for sensitive config
- VPC endpoints for private AWS service access
- CloudWatch audit logs

⚠️ **To Add:**
- WAF rules on ALB (via Cloudflare)
- Bastion host for database access
- VPN for administrative access
- Database proxy (RDS Proxy) for connection pooling

---

## 🔄 Disaster Recovery

### Backup Strategy

- **RDS:** Daily snapshots, 14-day retention, automatic failover to standby
- **Redis:** 5-day snapshot retention, automatic failover
- **S3:** Versioning enabled, lifecycle rules for Glacier archive
- **Code:** Git repository as source of truth

### Recovery Procedures

```bash
# Restore from RDS snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier marsad-postgres-restored \
  --db-snapshot-identifier <snapshot-id>

# Restore individual objects from S3
aws s3 cp s3://$S3_BUCKET/documents/ . --recursive

# Redeploy containers from ECR (images remain available)
aws ecs update-service --cluster marsad-cluster --service marsad-api --force-new-deployment
```

---

## 🛠️ Troubleshooting

### Tasks not starting?

```bash
# Check task logs
aws logs tail /ecs/marsad --follow

# Check ECS Events
aws ecs describe-services --cluster marsad-cluster --services marsad-api | \
  jq '.services[0].events[:5]'

# Validate task definition
aws ecs describe-task-definition --task-definition marsad-api
```

### High database connections?

```bash
# Check active connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Restart connection pooling
# (manual, or scale ECS down/up to flush connections)
```

### Redis OOM errors?

```bash
# Check Redis memory
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name DatabaseMemoryUsagePercentage \
  --dimensions Name=ReplicationGroupId,Value=marsad-redis \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Scale up if sustained >80%
```

---

## 📝 File Structure

```
infrastructure/
├── terraform/
│   ├── main.tf                    # Root module
│   ├── variables.tf               # Variable definitions
│   ├── terraform.tfvars.example   # Example config
│   ├── terraform.tfstate*         # ⚠️ State file (in remote S3 backend)
│   └── modules/
│       ├── vpc/                   # VPC, subnets, NAT, VPC endpoints
│       ├── security_groups/       # Security group definitions
│       ├── alb/                   # Application Load Balancer
│       ├── ecs/                   # Cluster, services, tasks
│       ├── rds/                   # PostgreSQL database
│       ├── elasticache/           # Redis cluster
│       ├── s3/                    # S3 buckets
│       ├── ecr/                   # Container registries
│       ├── cloudwatch/            # Logs, metrics, alarms, dashboard
│       ├── secrets_manager/       # Application secrets
│       └── iam/                   # IAM roles and policies
├── docker/
│   ├── Dockerfile.web             # Next.js frontend
│   ├── Dockerfile.api             # NestJS backend
│   └── Dockerfile.worker          # BullMQ worker
└── docs/
    └── DEPLOYMENT.md              # This file
```

---

## 🔗 Key Outputs

After deployment, Terraform outputs:

```json
{
  "alb_dns_name": "marsad-alb-123.eu-central-1.elb.amazonaws.com",
  "ecs_cluster_name": "marsad-cluster",
  "rds_endpoint": "marsad-postgres.abc123.eu-central-1.rds.amazonaws.com:5432",
  "redis_endpoint": "marsad-redis-001.abc123.cache.eu-central-1.amazonaws.com",
  "s3_bucket_name": "marsad-documents-123456789012",
  "ecr_repository_urls": {
    "web": "123456789012.dkr.ecr.eu-central-1.amazonaws.com/marsad-web",
    "api": "123456789012.dkr.ecr.eu-central-1.amazonaws.com/marsad-api",
    "worker": "123456789012.dkr.ecr.eu-central-1.amazonaws.com/marsad-worker"
  }
}
```

---

## 📞 Support

**Issues with Terraform?**
- Run `terraform plan` to validate
- Check `terraform.tfvars` for missing/invalid values
- Review CloudFormation events in AWS Console

**Issues with infrastructure?**
- Check CloudWatch Logs
- Verify security group rules
- Run `aws ec2 describe-security-groups` to audit access

---

**Last Updated:** July 15, 2026  
**Terraform Version:** 1.x  
**AWS Region:** eu-central-1 (Frankfurt)
