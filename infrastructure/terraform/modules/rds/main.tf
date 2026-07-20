# RDS Database Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = var.database_subnets

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-postgres"

  engine               = "postgres"
  engine_version       = "16.1"
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type         = "gp3"
  storage_encrypted    = var.enable_encryption

  db_name  = var.db_name
  username = var.db_username
  # password is provided by random_password from main.tf

  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [var.rds_security_group_id]

  publicly_accessible             = false
  multi_az                        = var.multi_az

  backup_retention_period         = var.backup_retention_period
  backup_window                   = var.backup_window
  maintenance_window              = var.maintenance_window
  copy_tags_to_snapshot           = true

  iam_database_authentication_enabled = var.enable_iam_auth
  enabled_cloudwatch_logs_exports  = ["postgresql"]

  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${var.project_name}-postgres-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  performance_insights_enabled    = true
  performance_insights_retention_period = 7
  monitoring_interval             = 60
  monitoring_role_arn             = aws_iam_role.rds_monitoring.arn

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

# Enhanced Monitoring IAM Role
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "monitoring.rds.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Alarms for RDS
resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.project_name}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Alert when RDS CPU exceeds 80%"
  alarm_actions       = var.alarm_topic_arn != "" ? [var.alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.project_name}-rds-storage-space"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "10737418240" # 10 GB in bytes
  alarm_description   = "Alert when RDS storage is less than 10 GB"
  alarm_actions       = var.alarm_topic_arn != "" ? [var.alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.project_name}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Alert when database connections exceed 80"
  alarm_actions       = var.alarm_topic_arn != "" ? [var.alarm_topic_arn] : []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.id
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

variable "database_subnets" {
  type = list(string)
}

variable "rds_security_group_id" {
  type = string
}

variable "db_instance_class" {
  type = string
}

variable "db_allocated_storage" {
  type = number
}

variable "db_max_allocated_storage" {
  type = number
}

variable "db_name" {
  type = string
}

variable "db_username" {
  type = string
}

variable "backup_retention_period" {
  type = number
}

variable "backup_window" {
  type = string
}

variable "maintenance_window" {
  type = string
}

variable "multi_az" {
  type = bool
}

variable "enable_encryption" {
  type = bool
}

variable "enable_iam_auth" {
  type = bool
}

variable "alarm_topic_arn" {
  type    = string
  default = ""
}

output "db_endpoint" {
  value       = aws_db_instance.main.endpoint
  description = "Database endpoint"
  sensitive   = true
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "db_username" {
  value       = aws_db_instance.main.username
  sensitive   = true
}

output "db_security_group_id" {
  value = var.rds_security_group_id
}
