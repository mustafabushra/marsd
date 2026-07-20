resource "aws_secretsmanager_secret" "main" {
  name                    = "${var.project_name}/app-secrets"
  description             = "Application secrets for ${var.project_name}"
  recovery_window_in_days = 7

  tags = {
    Name = "${var.project_name}-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "main" {
  secret_id = aws_secretsmanager_secret.main.id
  secret_string = jsonencode(var.secrets)
}

resource "aws_secretsmanager_secret_rotation" "main" {
  secret_id           = aws_secretsmanager_secret.main.id
  rotation_rules {
    automatically_after_days = 30
  }
}

variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "secrets" {
  type      = map(string)
  sensitive = true
}

output "secrets_manager_arn" {
  value = aws_secretsmanager_secret.main.arn
}

output "secrets_manager_id" {
  value = aws_secretsmanager_secret.main.id
}
