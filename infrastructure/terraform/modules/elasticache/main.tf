# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-redis-subnet-group"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "${var.project_name}-redis-subnet-group"
  }
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.project_name}-redis"
  description                = "Redis cluster for ${var.project_name}"
  engine                     = "redis"
  engine_version             = var.engine_version
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_nodes
  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled           = var.multi_az_enabled

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth_token.result

  parameter_group_name       = aws_elasticache_parameter_group.main.name
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [var.elasticache_security_group_id]

  snapshot_retention_limit   = 5
  snapshot_window            = "03:00-04:00"
  maintenance_window         = "sun:04:00-sun:05:00"

  notification_topic_arn     = var.alarm_topic_arn != "" ? var.alarm_topic_arn : null

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "slow-log"
  }

  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_engine_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "json"
    log_type         = "engine-log"
  }

  tags = {
    Name = "${var.project_name}-redis"
  }
}

# Custom Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  name   = "${var.project_name}-redis-params"
  family = var.parameter_group_family

  # Memory optimization
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Connection settings
  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "60"
  }

  tags = {
    Name = "${var.project_name}-redis-params"
  }
}

# Random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = true
}

# CloudWatch Log Groups for Redis
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}-redis-slow-log"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "redis_engine_log" {
  name              = "/aws/elasticache/${var.project_name}-redis-engine-log"
  retention_in_days = 7
}

# CloudWatch Alarms for Redis
resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "${var.project_name}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "Alert when Redis CPU exceeds 75%"
  alarm_actions       = var.alarm_topic_arn != "" ? [var.alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.project_name}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Alert when Redis memory exceeds 80%"
  alarm_actions       = var.alarm_topic_arn != "" ? [var.alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${var.project_name}-redis-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "500"
  alarm_description   = "Alert when Redis connections exceed 500"
  alarm_actions       = var.alarm_topic_arn != "" ? [var.alarm_topic_arn] : []

  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.main.id
  }
}

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "elasticache_security_group_id" {
  type = string
}

variable "node_type" {
  type = string
}

variable "num_cache_nodes" {
  type = number
}

variable "parameter_group_family" {
  type = string
}

variable "engine_version" {
  type = string
}

variable "automatic_failover_enabled" {
  type = bool
}

variable "multi_az_enabled" {
  type = bool
}

variable "alarm_topic_arn" {
  type    = string
  default = ""
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  description = "Redis primary endpoint"
  sensitive   = true
}

output "redis_auth_token" {
  value       = random_password.redis_auth_token.result
  description = "Redis auth token"
  sensitive   = true
}

output "redis_port" {
  value = 6379
}
