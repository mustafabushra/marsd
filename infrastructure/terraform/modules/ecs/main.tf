resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.project_name}-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }

  default_capacity_provider_strategy {
    weight            = 0
    capacity_provider = "FARGATE_SPOT"
  }
}

# API Service Task Definition
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([{
    name      = "api"
    image     = var.api_container_image
    essential = true
    portMappings = [{
      containerPort = var.api_container_port
      hostPort      = var.api_container_port
      protocol      = "tcp"
    }]

    environment = [
      {
        name  = "NODE_ENV"
        value = "production"
      },
      {
        name  = "REDIS_URL"
        value = var.redis_url
      },
      {
        name  = "S3_BUCKET"
        value = var.s3_bucket_name
      }
    ]

    secrets = [
      {
        name      = "DATABASE_URL"
        valueFrom = "${var.secrets_manager_arn}:database_url::"
      },
      {
        name      = "JWT_SECRET"
        valueFrom = "${var.secrets_manager_arn}:jwt_secret::"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.cloudwatch_log_group
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "api"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.api_container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name = "${var.project_name}-api-task"
  }
}

# Web Service Task Definition
resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project_name}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([{
    name      = "web"
    image     = var.web_container_image
    essential = true
    portMappings = [{
      containerPort = var.web_container_port
      hostPort      = var.web_container_port
      protocol      = "tcp"
    }]

    environment = [
      {
        name  = "NODE_ENV"
        value = "production"
      },
      {
        name  = "API_URL"
        value = "http://localhost:${var.api_container_port}"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.cloudwatch_log_group
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "web"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.web_container_port}/ || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = {
    Name = "${var.project_name}-web-task"
  }
}

# Worker Service Task Definition (for BullMQ)
resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project_name}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = var.ecs_task_execution_role_arn
  task_role_arn            = var.ecs_task_role_arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = var.worker_container_image
    essential = true

    environment = [
      {
        name  = "NODE_ENV"
        value = "production"
      },
      {
        name  = "REDIS_URL"
        value = var.redis_url
      },
      {
        name  = "S3_BUCKET"
        value = var.s3_bucket_name
      }
    ]

    secrets = [
      {
        name      = "DATABASE_URL"
        valueFrom = "${var.secrets_manager_arn}:database_url::"
      },
      {
        name      = "JWT_SECRET"
        valueFrom = "${var.secrets_manager_arn}:jwt_secret::"
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = var.cloudwatch_log_group
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])

  tags = {
    Name = "${var.project_name}-worker-task"
  }
}

# API Service
resource "aws_ecs_service" "api" {
  name            = "${var.project_name}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.alb_target_group_arn
    container_name   = "api"
    container_port   = var.api_container_port
  }

  depends_on = [
    aws_ecs_cluster.main
  ]

  tags = {
    Name = "${var.project_name}-api-service"
  }
}

# Worker Service (without load balancer)
resource "aws_ecs_service" "worker" {
  name            = "${var.project_name}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }

  depends_on = [
    aws_ecs_cluster.main
  ]

  tags = {
    Name = "${var.project_name}-worker-service"
  }
}

# Auto Scaling Target
resource "aws_appautoscaling_target" "ecs_target" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based scaling
resource "aws_appautoscaling_policy" "ecs_policy_cpu" {
  name               = "${var.project_name}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Memory-based scaling
resource "aws_appautoscaling_policy" "ecs_policy_memory" {
  name               = "${var.project_name}-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value = 80.0
  }
}

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnets" {
  type = list(string)
}

variable "ecs_security_group_id" {
  type = string
}

variable "alb_target_group_arn" {
  type = string
}

variable "web_container_image" {
  type = string
}

variable "api_container_image" {
  type = string
}

variable "worker_container_image" {
  type = string
}

variable "web_container_port" {
  type = number
}

variable "api_container_port" {
  type = number
}

variable "desired_count" {
  type = number
}

variable "min_capacity" {
  type = number
}

variable "max_capacity" {
  type = number
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "redis_url" {
  type      = string
  sensitive = true
}

variable "s3_bucket_name" {
  type = string
}

variable "cloudwatch_log_group" {
  type = string
}

variable "secrets_manager_arn" {
  type = string
}

variable "ecs_task_execution_role_arn" {
  type = string
}

variable "ecs_task_role_arn" {
  type = string
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "api_service_name" {
  value = aws_ecs_service.api.name
}

output "worker_service_name" {
  value = aws_ecs_service.worker.name
}
