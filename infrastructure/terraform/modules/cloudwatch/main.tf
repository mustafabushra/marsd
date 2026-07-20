resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-ecs-logs"
  }
}

resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-rds-logs"
  }
}

resource "aws_cloudwatch_log_group" "alb" {
  name              = "/aws/alb/${var.project_name}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-alb-logs"
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", { stat = "Average" }],
            [".", "RequestCount", { stat = "Sum" }],
            [".", "HTTPCode_Target_5XX_Count", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "ALB Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization"],
            [".", "DatabaseConnections"],
            [".", "FreeStorageSpace"]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "RDS Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ElastiCache", "EngineCPUUtilization"],
            [".", "DatabaseMemoryUsagePercentage"],
            [".", "CurrConnections"]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "Redis Metrics"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-5xx-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "2"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = "60"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alert when ALB 5XX errors exceed 5 in 2 minutes"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  count               = var.enable_alarms ? 1 : 0
  alarm_name          = "${var.project_name}-alb-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = "0.8"
  alarm_description   = "Alert when ALB response time exceeds 800ms"
  alarm_actions       = var.alarm_sns_topic_arn != "" ? [var.alarm_sns_topic_arn] : []
}

data "aws_region" "current" {}

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "log_retention_days" {
  type = number
}

variable "enable_alarms" {
  type = bool
}

variable "alarm_sns_topic_arn" {
  type    = string
  default = ""
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.ecs.name
}

output "log_group_arn" {
  value = aws_cloudwatch_log_group.ecs.arn
}
