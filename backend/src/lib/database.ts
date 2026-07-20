/**
 * Marsad Database Helper
 * Supabase + PostgreSQL Integration
 *
 * Purpose: Centralized database client setup with JWT authentication,
 * multi-tenant support, and RLS enforcement
 *
 * Environment Variables Required:
 * - SUPABASE_URL: https://[project-id].supabase.co
 * - SUPABASE_ANON_KEY: Public key for client-side auth
 * - SUPABASE_SERVICE_ROLE_KEY: Admin key (server-side only)
 * - DATABASE_URL: PostgreSQL connection string (optional, for direct connection)
 */

import {
  createClient,
  SupabaseClient,
  PostgrestError,
  AuthSession,
  RealtimeChannel,
} from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * JWT Claims structure - matches RLS policy expectations
 */
interface JWTClaims {
  sub: string; // User ID
  tenant_id: string; // Tenant ID (null for platform admins)
  role: "platform_admin" | "company_admin" | "company_member" | "reviewer";
  email: string;
  iat: number;
  exp: number;
}

/**
 * Database session with JWT token and claims
 */
interface DatabaseSession {
  userId: string;
  tenantId: string | null;
  role: string;
  email: string;
  token: string;
  expiresAt: Date;
}

/**
 * Query options for RLS-aware queries
 */
interface QueryOptions {
  signal?: AbortSignal;
  throwOnError?: boolean;
}

/**
 * Database operation result
 */
interface DBResult<T> {
  data: T | null;
  error: PostgrestError | null;
  status: number;
  statusText: string;
}

// ============================================================================
// SUPABASE CLIENT FACTORY
// ============================================================================

class SupabaseDatabase {
  private client: SupabaseClient | null = null;
  private adminClient: SupabaseClient | null = null;
  private currentSession: DatabaseSession | null = null;

  /**
   * Initialize Supabase client (anonymous key)
   * Used for client-side queries with RLS
   */
  public initClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables"
      );
    }

    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "X-Client-Info": "marsad-backend/1.0",
        },
      },
    });

    return this.client;
  }

  /**
   * Initialize Supabase admin client (service role key)
   * NEVER expose to clients - server-side only
   * Bypasses RLS policies
   */
  public initAdminClient(): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
      );
    }

    this.adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "X-Client-Info": "marsad-backend-admin/1.0",
        },
      },
    });

    return this.adminClient;
  }

  /**
   * Get current initialized client
   */
  public getClient(): SupabaseClient {
    if (!this.client) {
      return this.initClient();
    }
    return this.client;
  }

  /**
   * Get admin client (server-side only)
   */
  public getAdminClient(): SupabaseClient {
    if (!this.adminClient) {
      return this.initAdminClient();
    }
    return this.adminClient;
  }

  // ========================================================================
  // JWT & SESSION MANAGEMENT
  // ========================================================================

  /**
   * Create JWT token for a user
   * Token is used in Authorization header for RLS policies
   */
  public createJWT(claims: Omit<JWTClaims, "iat" | "exp">): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("Missing JWT_SECRET environment variable");
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 24 * 60 * 60; // 24 hours

    return jwt.sign(
      {
        ...claims,
        iat: now,
        exp: now + expiresIn,
      },
      secret,
      {
        algorithm: "HS256",
      }
    );
  }

  /**
   * Verify and decode JWT token
   */
  public verifyJWT(token: string): JWTClaims | null {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("Missing JWT_SECRET environment variable");
    }

    try {
      return jwt.verify(token, secret, {
        algorithms: ["HS256"],
      }) as JWTClaims;
    } catch (error) {
      console.error("JWT verification failed:", error);
      return null;
    }
  }

  /**
   * Set session with JWT token
   * Subsequent queries will use this JWT for RLS enforcement
   */
  public async setSession(session: DatabaseSession): Promise<void> {
    this.currentSession = session;

    const client = this.getClient();
    // Set Authorization header for all subsequent requests
    // This makes the JWT available to RLS policies via jwt.claims
    if (client) {
      await (client.auth as any).setSession({
        access_token: session.token,
        refresh_token: "",
      });
    }
  }

  /**
   * Get current session
   */
  public getSession(): DatabaseSession | null {
    return this.currentSession;
  }

  /**
   * Clear current session
   */
  public async clearSession(): Promise<void> {
    this.currentSession = null;
    const client = this.getClient();
    if (client && client.auth && 'signOut' in client.auth) {
      await (client.auth as any).signOut();
    }
  }

  // ========================================================================
  // QUERY HELPERS WITH RLS ENFORCEMENT
  // ========================================================================

  /**
   * SELECT query with RLS enforcement
   * Only returns rows visible to current user based on RLS policies
   */
  public async select<T>(
    table: string,
    columns: string = "*",
    options?: QueryOptions
  ): Promise<DBResult<T[]>> {
    const client = this.getClient();

    try {
      const query = client.from(table).select(columns);

      const { data, error, status, statusText } = await query;

      return {
        data: data as T[],
        error,
        status,
        statusText,
      };
    } catch (error) {
      return {
        data: null,
        error: error as PostgrestError,
        status: 500,
        statusText: "Internal Server Error",
      };
    }
  }

  /**
   * SELECT with WHERE clause
   */
  public async selectWhere<T>(
    table: string,
    column: string,
    operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "in",
    value: any,
    columns: string = "*"
  ): Promise<DBResult<T[]>> {
    const client = this.getClient();

    try {
      let query = client.from(table).select(columns);

      if (operator === "eq") {
        query = query.eq(column, value);
      } else if (operator === "neq") {
        query = query.neq(column, value);
      } else if (operator === "gt") {
        query = query.gt(column, value);
      } else if (operator === "gte") {
        query = query.gte(column, value);
      } else if (operator === "lt") {
        query = query.lt(column, value);
      } else if (operator === "lte") {
        query = query.lte(column, value);
      } else if (operator === "like") {
        query = query.like(column, value);
      } else if (operator === "in") {
        query = query.in(column, value);
      }

      const { data, error, status, statusText } = await query;

      return {
        data: data as T[],
        error,
        status,
        statusText,
      };
    } catch (error) {
      return {
        data: null,
        error: error as PostgrestError,
        status: 500,
        statusText: "Internal Server Error",
      };
    }
  }

  /**
   * SELECT single row
   */
  public async selectOne<T>(
    table: string,
    id: string,
    idColumn: string = "id"
  ): Promise<DBResult<T>> {
    const result = await this.selectWhere<T>(table, idColumn, "eq", id);

    return {
      data: result.data ? result.data[0] : null,
      error: result.error,
      status: result.status,
      statusText: result.statusText,
    };
  }

  /**
   * INSERT row
   */
  public async insert<T>(
    table: string,
    data: Record<string, any>
  ): Promise<DBResult<T>> {
    const client = this.getClient();

    try {
      const { data: result, error, status, statusText } = await client
        .from(table)
        .insert([data])
        .select()
        .single();

      return {
        data: result as T,
        error,
        status,
        statusText,
      };
    } catch (error) {
      return {
        data: null,
        error: error as PostgrestError,
        status: 500,
        statusText: "Internal Server Error",
      };
    }
  }

  /**
   * UPDATE row
   */
  public async update<T>(
    table: string,
    id: string,
    data: Record<string, any>,
    idColumn: string = "id"
  ): Promise<DBResult<T>> {
    const client = this.getClient();

    try {
      const { data: result, error, status, statusText } = await client
        .from(table)
        .update(data)
        .eq(idColumn, id)
        .select()
        .single();

      return {
        data: result as T,
        error,
        status,
        statusText,
      };
    } catch (error) {
      return {
        data: null,
        error: error as PostgrestError,
        status: 500,
        statusText: "Internal Server Error",
      };
    }
  }

  /**
   * DELETE row
   */
  public async delete(
    table: string,
    id: string,
    idColumn: string = "id"
  ): Promise<{ error: PostgrestError | null; status: number }> {
    const client = this.getClient();

    try {
      const { error, status } = await client
        .from(table)
        .delete()
        .eq(idColumn, id);

      return { error, status };
    } catch (error) {
      return {
        error: error as PostgrestError,
        status: 500,
      };
    }
  }

  /**
   * Raw SQL query (admin only - bypasses RLS)
   * NEVER use for user-facing operations
   */
  public async rawQuery<T>(sql: string, params: any[] = []): Promise<T[]> {
    const adminClient = this.getAdminClient();

    try {
      const { data, error } = await adminClient.rpc("exec_raw_sql", {
        query: sql,
        params,
      });

      if (error) {
        throw new Error(`Raw SQL error: ${error.message}`);
      }

      return data as T[];
    } catch (error) {
      console.error("Raw SQL query failed:", error);
      throw error;
    }
  }

  // ========================================================================
  // AUDIT LOGGING
  // ========================================================================

  /**
   * Log action to audit trail (append-only)
   */
  public async logAudit(auditData: {
    tenant_id: string | null;
    actor_id: string;
    actor_role: string;
    action: string;
    entity: string;
    entity_id: string | null;
    meta?: Record<string, any>;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    const adminClient = this.getAdminClient();

    try {
      const { error } = await adminClient.from("audit_logs").insert([auditData]);

      if (error) {
        console.error("Audit log insert failed:", error);
      }
    } catch (error) {
      console.error("Failed to log audit:", error);
      // Don't throw - audit logging should not block operations
    }
  }

  // ========================================================================
  // REALTIME SUBSCRIPTIONS
  // ========================================================================

  /**
   * Subscribe to realtime changes (requires RLS enforcement)
   */
  public subscribe<T>(
    table: string,
    event: "INSERT" | "UPDATE" | "DELETE" | "*",
    callback: (payload: { new: T; old: T; eventType: string }) => void
  ): RealtimeChannel | null {
    const client = this.getClient();

    if (!this.currentSession) {
      console.warn(
        "Cannot subscribe to realtime without active session (RLS enforcement)"
      );
      return null;
    }

    try {
      return client
        .channel(`${table}:${event}`)
        .on(
          "postgres_changes",
          {
            event,
            schema: "public",
            table,
          },
          callback as any
        )
        .subscribe();
    } catch (error) {
      console.error("Subscription failed:", error);
      return null;
    }
  }

  /**
   * Unsubscribe from channel
   */
  public unsubscribe(channel: RealtimeChannel | null): void {
    if (channel) {
      this.getClient().removeChannel(channel);
    }
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  /**
   * Health check - verify database connectivity and RLS
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    rls_enabled: boolean;
    session_active: boolean;
  }> {
    try {
      // Check basic connectivity
      const { error } = await this.select("tenants", "id", {
        throwOnError: true,
      });

      const rls_enabled = error !== null; // RLS will block if no session

      return {
        healthy: !error,
        rls_enabled,
        session_active: this.currentSession !== null,
      };
    } catch (error) {
      console.error("Health check failed:", error);
      return {
        healthy: false,
        rls_enabled: false,
        session_active: false,
      };
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const db = new SupabaseDatabase();

// ============================================================================
// EXPORTS
// ============================================================================

export type { DatabaseSession, JWTClaims, DBResult, QueryOptions };
export { SupabaseDatabase };
