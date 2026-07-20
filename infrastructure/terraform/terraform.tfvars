# Terraform Variables for Marsad Deployment
# Copy this file to terraform.tfvars and fill in your values

aws_region   = "eu-central-1"
project_name = "marsad"
environment  = "prod"

# VPC Configuration
vpc_cidr              = "10.0.0.0/16"
availability_zones    = ["eu-central-1a", "eu-central-1b"]
public_subnet_cidrs   = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs  = ["10.0.10.0/24", "10.0.11.0/24"]
database_subnet_cidrs = ["10.0.20.0/24", "10.0.21.0/24"]

# ALB Configuration
alb_ingress_cidr = "0.0.0.0/0"
app_port         = 3000
web_port         = 3001
enable_https     = true
# ssl_certificate_arn = "arn:aws:acm:eu-central-1:ACCOUNT_ID:certificate/CERT_ID"
health_check_path = "/health"

# ECS Configuration
# Get these from ECR after pushing your images
# web_container_image    = "ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/marsad-web:latest"
# api_container_image    = "ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/marsad-api:latest"
# worker_container_image = "ACCOUNT_ID.dkr.ecr.eu-central-1.amazonaws.com/marsad-worker:latest"

ecs_desired_count = 2
ecs_min_capacity  = 2
ecs_max_capacity  = 10

# RDS Configuration
db_instance_class        = "db.t3.small"      # For dev/staging; use db.r6i.large for production
db_allocated_storage     = 100                 # GB
db_max_allocated_storage = 500                 # GB
db_name                  = "marsad"
db_username              = "admin"
db_multi_az              = true
db_enable_encryption     = true
db_enable_iam_auth       = true
backup_retention_period  = 14
backup_window            = "03:00-04:00"       # UTC
maintenance_window       = "sun:04:00-sun:05:00" # UTC

# ElastiCache Configuration
redis_node_type              = "cache.t3.small"  # For dev; use cache.r7g.large for production
redis_num_nodes              = 2
redis_parameter_group_family = "redis7"
redis_engine_version         = "7.0"
redis_automatic_failover     = true
redis_multi_az               = true

# S3 Configuration
s3_enable_versioning = true
s3_enable_encryption = true
s3_enable_lifecycle  = true
s3_cors_origins      = ["https://yourdomain.com"]

# CloudWatch Configuration
log_retention_days        = 90
enable_cloudwatch_alarms  = true
# alarm_sns_topic_arn     = "arn:aws:sns:eu-central-1:ACCOUNT_ID:marsad-alerts"
