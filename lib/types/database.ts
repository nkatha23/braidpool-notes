export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          role: "tenant" | "landlord" | "admin"
          phone: string | null
          name: string | null
          email: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          role: "tenant" | "landlord" | "admin"
          phone?: string | null
          name?: string | null
          email?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          role?: "tenant" | "landlord" | "admin"
          phone?: string | null
          name?: string | null
          email?: string | null
        }
      }
      properties: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          name: string
          address: string
          city: string
          country: string
          landlord_id: string
          total_units: number
          description: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          name: string
          address: string
          city: string
          country?: string
          landlord_id: string
          total_units?: number
          description?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          name?: string
          address?: string
          city?: string
          country?: string
          landlord_id?: string
          total_units?: number
          description?: string | null
        }
      }
      units: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          property_id: string
          unit_number: string
          rent_amount: number
          tenant_id: string | null
          status: "occupied" | "vacant" | "maintenance"
          lease_start_date: string | null
          lease_end_date: string | null
          deposit_amount: number | null
          description: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          property_id: string
          unit_number: string
          rent_amount: number
          tenant_id?: string | null
          status?: "occupied" | "vacant" | "maintenance"
          lease_start_date?: string | null
          lease_end_date?: string | null
          deposit_amount?: number | null
          description?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          property_id?: string
          unit_number?: string
          rent_amount?: number
          tenant_id?: string | null
          status?: "occupied" | "vacant" | "maintenance"
          lease_start_date?: string | null
          lease_end_date?: string | null
          deposit_amount?: number | null
          description?: string | null
        }
      }
      payments: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          unit_id: string
          amount: number
          payment_method: "mpesa" | "card" | "paypal" | "stripe" | "flutterwave" | "bank_transfer"
          payment_date: string
          due_date: string
          status: "pending" | "completed" | "failed" | "refunded"
          transaction_id: string | null
          receipt_url: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id: string
          unit_id: string
          amount: number
          payment_method: "mpesa" | "card" | "paypal" | "stripe" | "flutterwave" | "bank_transfer"
          payment_date: string
          due_date: string
          status?: "pending" | "completed" | "failed" | "refunded"
          transaction_id?: string | null
          receipt_url?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id?: string
          unit_id?: string
          amount?: number
          payment_method?: "mpesa" | "card" | "paypal" | "stripe" | "flutterwave" | "bank_transfer"
          payment_date?: string
          due_date?: string
          status?: "pending" | "completed" | "failed" | "refunded"
          transaction_id?: string | null
          receipt_url?: string | null
          notes?: string | null
        }
      }
      smart_locks: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          unit_id: string
          lock_id: string
          status: "locked" | "unlocked" | "maintenance"
          last_action_at: string
          last_action_by: string | null
          auto_lock_enabled: boolean
          battery_level: number
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          unit_id: string
          lock_id: string
          status?: "locked" | "unlocked" | "maintenance"
          last_action_at?: string
          last_action_by?: string | null
          auto_lock_enabled?: boolean
          battery_level?: number
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          unit_id?: string
          lock_id?: string
          status?: "locked" | "unlocked" | "maintenance"
          last_action_at?: string
          last_action_by?: string | null
          auto_lock_enabled?: boolean
          battery_level?: number
        }
      }
      lock_activities: {
        Row: {
          id: string
          created_at: string
          lock_id: string
          action: "lock" | "unlock" | "override" | "auto_lock"
          triggered_by: string | null
          reason: string | null
          success: boolean
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          lock_id: string
          action: "lock" | "unlock" | "override" | "auto_lock"
          triggered_by?: string | null
          reason?: string | null
          success?: boolean
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          lock_id?: string
          action?: "lock" | "unlock" | "override" | "auto_lock"
          triggered_by?: string | null
          reason?: string | null
          success?: boolean
          ip_address?: string | null
          user_agent?: string | null
        }
      }
      reminders: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          tenant_id: string
          unit_id: string
          type: "payment_due" | "payment_overdue" | "lease_expiry" | "maintenance" | "general"
          title: string
          message: string
          due_date: string | null
          days_before: number
          delivery_methods: string[]
          status: "pending" | "sent" | "failed" | "cancelled"
          sent_at: string | null
          recurring: boolean
          recurring_interval: "daily" | "weekly" | "monthly" | "yearly" | null
          priority: "low" | "medium" | "high" | "urgent"
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id: string
          unit_id: string
          type: "payment_due" | "payment_overdue" | "lease_expiry" | "maintenance" | "general"
          title: string
          message: string
          due_date?: string | null
          days_before?: number
          delivery_methods?: string[]
          status?: "pending" | "sent" | "failed" | "cancelled"
          sent_at?: string | null
          recurring?: boolean
          recurring_interval?: "daily" | "weekly" | "monthly" | "yearly" | null
          priority?: "low" | "medium" | "high" | "urgent"
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          tenant_id?: string
          unit_id?: string
          type?: "payment_due" | "payment_overdue" | "lease_expiry" | "maintenance" | "general"
          title?: string
          message?: string
          due_date?: string | null
          days_before?: number
          delivery_methods?: string[]
          status?: "pending" | "sent" | "failed" | "cancelled"
          sent_at?: string | null
          recurring?: boolean
          recurring_interval?: "daily" | "weekly" | "monthly" | "yearly" | null
          priority?: "low" | "medium" | "high" | "urgent"
        }
      }
      notifications: {
        Row: {
          id: string
          created_at: string
          user_id: string
          title: string
          message: string
          type: "payment" | "reminder" | "system" | "lock" | "maintenance"
          read: boolean
          read_at: string | null
          action_url: string | null
          metadata: Record<string, any>
        }
        Insert: {
          id?: string
          created_at?: string
          user_id: string
          title: string
          message: string
          type: "payment" | "reminder" | "system" | "lock" | "maintenance"
          read?: boolean
          read_at?: string | null
          action_url?: string | null
          metadata?: Record<string, any>
        }
        Update: {
          id?: string
          created_at?: string
          user_id?: string
          title?: string
          message?: string
          type?: "payment" | "reminder" | "system" | "lock" | "maintenance"
          read?: boolean
          read_at?: string | null
          action_url?: string | null
          metadata?: Record<string, any>
        }
      }
      notification_preferences: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          user_id: string
          email_enabled: boolean
          sms_enabled: boolean
          whatsapp_enabled: boolean
          push_enabled: boolean
          payment_reminders: boolean
          lease_reminders: boolean
          maintenance_alerts: boolean
          system_updates: boolean
          reminder_timing: number
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          user_id: string
          email_enabled?: boolean
          sms_enabled?: boolean
          whatsapp_enabled?: boolean
          push_enabled?: boolean
          payment_reminders?: boolean
          lease_reminders?: boolean
          maintenance_alerts?: boolean
          system_updates?: boolean
          reminder_timing?: number
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          user_id?: string
          email_enabled?: boolean
          sms_enabled?: boolean
          whatsapp_enabled?: boolean
          push_enabled?: boolean
          payment_reminders?: boolean
          lease_reminders?: boolean
          maintenance_alerts?: boolean
          system_updates?: boolean
          reminder_timing?: number
        }
      }
    }
  }
}

// Additional type definitions
export type UserRole = "tenant" | "landlord" | "admin"
export type PaymentMethod = "mpesa" | "card" | "paypal" | "stripe" | "flutterwave" | "bank_transfer"
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded"
export type UnitStatus = "occupied" | "vacant" | "maintenance"
export type LockStatus = "locked" | "unlocked" | "maintenance"
export type LockAction = "lock" | "unlock" | "override" | "auto_lock"
export type ReminderType = "payment_due" | "payment_overdue" | "lease_expiry" | "maintenance" | "general"
export type ReminderStatus = "pending" | "sent" | "failed" | "cancelled"
export type NotificationType = "payment" | "reminder" | "system" | "lock" | "maintenance"
export type Priority = "low" | "medium" | "high" | "urgent"
export type RecurringInterval = "daily" | "weekly" | "monthly" | "yearly"
