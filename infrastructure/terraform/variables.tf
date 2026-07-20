variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name for naming resources"
  type        = string
  default     = "marsad"
}

variable "environment" {
  description = "Environment (prod, staging, dev)"
  type        = string
  default     = "prod"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

# VPC and Networking
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones for the region"
  type        = list(string)
  default     = ["eu-central-1a", "eu-central-1b"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (ECS)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]
}

# ALB Configuration
variable "alb_ingress_cidr" {
  description = "CIDR block allowed for ALB ingress"
  type        = string
  default     = "0.0.0.0/0"
}

variable "app_port" {
  description = "Port for NestJS API"
  type        = number
  default     = 3000
}

variable "web_port" {
  description = "Port for Next.js frontend"
  type        = number
  default     = 3001
}

variable "enable_https" {
  description = "Enable HTTPS on ALB"
  type        = bool
  default     = true
}

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate in ACM"
  type        = string
  default     = ""
}

variable "health_check_path" {
  description = "Health check path for ALB target group"
  type        = string
  default     = "/health"
}

variable "health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 30
}

variable "health_check_timeout" {
  description = "Health check timeout in seconds"
  type        = number
  default     = 5
}

variable "healthy_threshold" {
  description = "Number of successful health checks before target is healthy"
  type        = number
  default     = 2
}

# ECS Configuration
variable "web_container_image" {
  description = "Docker image for Next.js frontend (ECR URI)"
  type        = string
  default     = ""
}

variable "api_container_image" {
  description = "Docker image for NestJS API (ECR URI)"
  type        = string
  default     = ""
}

variable "worker_container_image" {
  description = "Docker image for BullMQ worker (ECR URI)"
  type        = string
  default     = ""
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_min_capacity" {
  description = "Minimum ECS task capacity for auto-scaling"
  type        = number
  default     = 2
}

variable "ecs_max_capacity" {
  description = "Maximum ECS task capacity for auto-scaling"
  type        = number
  default     = 10
}

# RDS Configuration
variable "db_instance_class" {
  description = "RDS instance type"
  type        = string
  default     = "db.t3.small"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for auto-scaling in GB"
  type        = number
  default     = 500
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "marsad"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "admin"
  sensitive   = true
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = true
}

variable "db_enable_encryption" {
  description = "Enable encryption at rest for RDS"
  type        = bool
  default     = true
}

variable "db_enable_iam_auth" {
  description = "Enable IAM database authentication"
  type        = bool
  default     = true
}

variable "backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 14
}

variable "backup_window" {
  description = "Backup window (UTC)"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Maintenance window (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

# ElastiCache Configuration
variable "redis_node_type" {
  description = "Redis node type"
  type        = string
  default     = "cache.t3.small"
}

variable "redis_num_nodes" {
  description = "Number of Redis cache nodes"
  type        = number
  default     = 2
}

variable "redis_parameter_group_family" {
  description = "Redis parameter group family"
  type        = string
  default     = "redis7"
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.0"
}

variable "redis_automatic_failover" {
  description = "Enable automatic failover for Redis"
  type        = bool
  default     = true
}

variable "redis_multi_az" {
  description = "Enable Multi-AZ for Redis"
  type        = bool
  default     = true
}

# S3 Configuration
variable "s3_enable_versioning" {
  description = "Enable versioning for S3"
  type        = bool
  default     = true
}

variable "s3_enable_encryption" {
  description = "Enable encryption for S3"
  type        = bool
  default     = true
}

variable "s3_enable_lifecycle" {
  description = "Enable lifecycle rules for S3"
  type        = bool
  default     = true
}

variable "s3_cors_origins" {
  description = "CORS allowed origins for S3"
  type        = list(string)
  default     = ["https://example.com"]
}

# CloudWatch Configuration
variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

variable "enable_cloudwatch_alarms" {
  description = "Enable CloudWatch alarms"
  type        = bool
  default     = true
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for alarm notifications"
  type        = string
  default     = ""
}
