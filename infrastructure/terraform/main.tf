terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # NOTE: For production, configure S3 backend after initial setup:
  # terraform init -migrate-state -backend-config="bucket=marsad-terraform-state" \
  #   -backend-config="key=prod/terraform.tfstate" \
  #   -backend-config="region=eu-central-1" \
  #   -backend-config="encrypt=true" \
  #   -backend-config="dynamodb_table=terraform-locks"
  #
  # For now, uses local state file. Move to S3 before production deploy.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
      Date        = timestamp()
    }
  }
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"

  project_name           = var.project_name
  environment            = var.environment
  aws_region             = var.aws_region
  vpc_cidr               = var.vpc_cidr
  availability_zones     = var.availability_zones
  public_subnet_cidrs    = var.public_subnet_cidrs
  private_subnet_cidrs   = var.private_subnet_cidrs
  database_subnet_cidrs  = var.database_subnet_cidrs
}

# Security Groups
module "security_groups" {
  source = "./modules/security_groups"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id

  alb_ingress_cidr = var.alb_ingress_cidr
  app_port         = var.app_port
}

# Application Load Balancer
module "alb" {
  source = "./modules/alb"

  project_name            = var.project_name
  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  public_subnets          = module.vpc.public_subnet_ids
  security_group_id       = module.security_groups.alb_security_group_id
  enable_https            = var.enable_https
  ssl_certificate_arn     = var.ssl_certificate_arn
  app_port                = var.app_port
  health_check_path       = var.health_check_path
  health_check_interval   = var.health_check_interval
  health_check_timeout    = var.health_check_timeout
  healthy_threshold       = var.healthy_threshold
}

# ECR (Container Registry)
module "ecr" {
  source = "./modules/ecr"

  project_name = var.project_name
  environment  = var.environment
}

# ECS Cluster and Services
module "ecs" {
  source = "./modules/ecs"

  project_name              = var.project_name
  environment               = var.environment
  aws_region                = var.aws_region
  vpc_id                    = module.vpc.vpc_id
  private_subnets          = module.vpc.private_subnet_ids
  ecs_security_group_id     = module.security_groups.ecs_security_group_id
  alb_target_group_arn      = module.alb.target_group_arn

  # Container specs
  web_container_image       = var.web_container_image
  api_container_image       = var.api_container_image
  worker_container_image    = var.worker_container_image

  web_container_port        = var.web_port
  api_container_port        = var.app_port

  # Scaling
  desired_count             = var.ecs_desired_count
  min_capacity              = var.ecs_min_capacity
  max_capacity              = var.ecs_max_capacity

  # Environment variables
  database_url              = "postgresql://${module.rds.db_username}:${random_password.db_password.result}@${module.rds.db_endpoint}:5432/${module.rds.db_name}"
  redis_url                 = "redis://${module.elasticache.redis_endpoint}:6379"
  s3_bucket_name            = module.s3.bucket_name
  cloudwatch_log_group      = module.cloudwatch.log_group_name
  secrets_manager_arn       = module.secrets.secrets_manager_arn

  # IAM Roles
  ecs_task_execution_role_arn = module.iam.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.iam.ecs_task_role_arn

  depends_on = [
    module.rds,
    module.elasticache,
    module.s3,
    module.secrets
  ]
}

# RDS PostgreSQL Database
module "rds" {
  source = "./modules/rds"

  project_name            = var.project_name
  environment             = var.environment
  vpc_id                  = module.vpc.vpc_id
  database_subnets        = module.vpc.database_subnet_ids
  rds_security_group_id   = module.security_groups.rds_security_group_id

  db_instance_class       = var.db_instance_class
  db_allocated_storage    = var.db_allocated_storage
  db_max_allocated_storage = var.db_max_allocated_storage
  db_name                 = var.db_name
  db_username             = var.db_username

  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  multi_az                = var.db_multi_az

  enable_encryption       = var.db_enable_encryption
  enable_iam_auth         = var.db_enable_iam_auth
  alarm_topic_arn         = var.alarm_sns_topic_arn
}

# Random password for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# ElastiCache Redis
module "elasticache" {
  source = "./modules/elasticache"

  project_name                = var.project_name
  environment                 = var.environment
  vpc_id                      = module.vpc.vpc_id
  subnet_ids                  = module.vpc.private_subnet_ids
  elasticache_security_group_id = module.security_groups.elasticache_security_group_id

  node_type                   = var.redis_node_type
  num_cache_nodes             = var.redis_num_nodes
  parameter_group_family      = var.redis_parameter_group_family
  engine_version              = var.redis_engine_version

  automatic_failover_enabled  = var.redis_automatic_failover
  multi_az_enabled            = var.redis_multi_az
  alarm_topic_arn             = var.alarm_sns_topic_arn
}

# S3 Bucket for Documents and Files
module "s3" {
  source = "./modules/s3"

  project_name            = var.project_name
  environment             = var.environment
  enable_versioning       = var.s3_enable_versioning
  enable_encryption       = var.s3_enable_encryption
  enable_lifecycle        = var.s3_enable_lifecycle

  lifecycle_rules = [
    {
      id     = "archive-old-documents"
      status = "Enabled"
      noncurrent_days = 90
      storage_class   = "STANDARD_IA"
    },
    {
      id     = "archive-invoices"
      status = "Enabled"
      prefix = "invoices/"
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
  ]

  cors_rules = [
    {
      allowed_headers = ["*"]
      allowed_methods = ["GET", "PUT", "POST"]
      allowed_origins = var.s3_cors_origins
      expose_headers  = ["ETag"]
      max_age_seconds = 3000
    }
  ]
}

# CloudWatch Logs
module "cloudwatch" {
  source = "./modules/cloudwatch"

  project_name        = var.project_name
  environment         = var.environment
  log_retention_days  = var.log_retention_days

  # Alarms
  enable_alarms        = var.enable_cloudwatch_alarms
  alarm_sns_topic_arn  = var.alarm_sns_topic_arn
}

# Secrets Manager
module "secrets" {
  source = "./modules/secrets_manager"

  project_name = var.project_name
  environment  = var.environment

  secrets = {
    "db_password" = random_password.db_password.result
    "jwt_secret"  = random_password.jwt_secret.result
  }
}

# Random JWT Secret
resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}

# IAM Role for ECS Task Execution
module "iam" {
  source = "./modules/iam"

  project_name      = var.project_name
  environment       = var.environment
  s3_bucket_name    = module.s3.bucket_name
  secrets_arn       = module.secrets.secrets_manager_arn
  rds_endpoint      = module.rds.db_endpoint
}

# Output values
output "alb_dns_name" {
  value       = module.alb.dns_name
  description = "DNS name of the load balancer"
}

output "ecs_cluster_name" {
  value       = module.ecs.cluster_name
  description = "ECS cluster name"
}

output "rds_endpoint" {
  value       = module.rds.db_endpoint
  description = "RDS database endpoint"
  sensitive   = true
}

output "redis_endpoint" {
  value       = module.elasticache.redis_endpoint
  description = "Redis cluster endpoint"
  sensitive   = true
}

output "s3_bucket_name" {
  value       = module.s3.bucket_name
  description = "S3 bucket name for documents"
}

output "ecr_repository_urls" {
  value       = module.ecr.repository_urls
  description = "ECR repository URLs"
}
