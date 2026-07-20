-- CreateTable AdminUser
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT[],
    "lastLogin" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable AuditLogAdmin
CREATE TABLE "audit_logs_admin" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "changes" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable SystemSetting (update existing if it exists)
-- First check if the table exists, if not create it
CREATE TABLE IF NOT EXISTS "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'string',
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailTemplate
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "variables" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable Integration
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "apiKey" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable BackupJob
CREATE TABLE "backup_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "fileSize" BIGINT,
    "filePath" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "nextScheduled" TIMESTAMP(3),

    CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable DisputeTicket
CREATE TABLE "dispute_tickets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reporterId" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assignedTo" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "dispute_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable FraudAlert
CREATE TABLE "fraud_alerts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "details" JSONB NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "action" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_alerts_pkey" PRIMARY KEY ("id")
);

-- UpdateTable AuditLog
ALTER TABLE "audit_logs" RENAME COLUMN "actorId" TO "userId";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actorId_fkey";

-- UpdateTable Notification
ALTER TABLE "notifications" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE;

-- UpdateTable Company
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_name_idx";

-- CreateIndex AdminUser
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");
CREATE INDEX "admin_users_status_idx" ON "admin_users"("status");

-- CreateIndex AuditLogAdmin
CREATE INDEX "audit_logs_admin_adminId_idx" ON "audit_logs_admin"("adminId");
CREATE INDEX "audit_logs_admin_action_idx" ON "audit_logs_admin"("action");
CREATE INDEX "audit_logs_admin_resourceType_idx" ON "audit_logs_admin"("resourceType");
CREATE INDEX "audit_logs_admin_resourceId_idx" ON "audit_logs_admin"("resourceId");
CREATE INDEX "audit_logs_admin_timestamp_idx" ON "audit_logs_admin"("timestamp");

-- CreateIndex SystemSetting
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
CREATE INDEX "system_settings_key_idx" ON "system_settings"("key");

-- CreateIndex EmailTemplate
CREATE UNIQUE INDEX "email_templates_name_key" ON "email_templates"("name");
CREATE INDEX "email_templates_name_idx" ON "email_templates"("name");
CREATE INDEX "email_templates_active_idx" ON "email_templates"("active");

-- CreateIndex Integration
CREATE INDEX "integrations_name_idx" ON "integrations"("name");
CREATE INDEX "integrations_active_idx" ON "integrations"("active");
CREATE INDEX "integrations_lastSync_idx" ON "integrations"("lastSync");

-- CreateIndex BackupJob
CREATE INDEX "backup_jobs_status_idx" ON "backup_jobs"("status");
CREATE INDEX "backup_jobs_createdAt_idx" ON "backup_jobs"("createdAt");

-- CreateIndex DisputeTicket
CREATE INDEX "dispute_tickets_companyId_idx" ON "dispute_tickets"("companyId");
CREATE INDEX "dispute_tickets_status_idx" ON "dispute_tickets"("status");
CREATE INDEX "dispute_tickets_priority_idx" ON "dispute_tickets"("priority");
CREATE INDEX "dispute_tickets_assignedTo_idx" ON "dispute_tickets"("assignedTo");
CREATE INDEX "dispute_tickets_createdAt_idx" ON "dispute_tickets"("createdAt");

-- CreateIndex FraudAlert
CREATE INDEX "fraud_alerts_companyId_idx" ON "fraud_alerts"("companyId");
CREATE INDEX "fraud_alerts_alertType_idx" ON "fraud_alerts"("alertType");
CREATE INDEX "fraud_alerts_riskScore_idx" ON "fraud_alerts"("riskScore");
CREATE INDEX "fraud_alerts_reviewed_idx" ON "fraud_alerts"("reviewed");
CREATE INDEX "fraud_alerts_createdAt_idx" ON "fraud_alerts"("createdAt");

-- AddForeignKey AuditLogAdmin
ALTER TABLE "audit_logs_admin" ADD CONSTRAINT "audit_logs_admin_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey DisputeTicket
ALTER TABLE "dispute_tickets" ADD CONSTRAINT "dispute_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey FraudAlert
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UpdateIndex AuditLog
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
