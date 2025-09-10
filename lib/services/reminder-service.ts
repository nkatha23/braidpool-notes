import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/lib/types/database"

type Reminder = Database["public"]["Tables"]["reminders"]["Row"]
type ReminderInsert = Database["public"]["Tables"]["reminders"]["Insert"]
type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"]

export class ReminderService {
  private supabase = createClient()

  async createReminder(reminder: ReminderInsert): Promise<Reminder | null> {
    const { data, error } = await this.supabase.from("reminders").insert(reminder).select().single()

    if (error) {
      console.error("Error creating reminder:", error)
      return null
    }

    return data
  }

  async getPendingReminders(): Promise<Reminder[]> {
    const { data, error } = await this.supabase
      .from("reminders")
      .select(`
        *,
        units (
          unit_number,
          rent_amount,
          properties (
            name,
            address
          )
        ),
        users (
          name,
          email,
          phone
        )
      `)
      .eq("status", "pending")
      .lte("due_date", new Date().toISOString().split("T")[0])

    if (error) {
      console.error("Error fetching pending reminders:", error)
      return []
    }

    return data || []
  }

  async processReminders(): Promise<void> {
    const pendingReminders = await this.getPendingReminders()

    for (const reminder of pendingReminders) {
      try {
        // Send reminder based on delivery methods
        const success = await this.sendReminder(reminder)

        if (success) {
          // Update reminder status
          await this.supabase
            .from("reminders")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", reminder.id)

          // Create notification
          await this.createNotification({
            user_id: reminder.tenant_id,
            title: reminder.title,
            message: reminder.message,
            type: this.mapReminderTypeToNotificationType(reminder.type),
            action_url: this.getActionUrl(reminder.type),
            metadata: {
              reminder_id: reminder.id,
              due_date: reminder.due_date,
              priority: reminder.priority,
            },
          })

          // Handle recurring reminders
          if (reminder.recurring && reminder.recurring_interval) {
            await this.createRecurringReminder(reminder)
          }
        } else {
          // Mark as failed
          await this.supabase.from("reminders").update({ status: "failed" }).eq("id", reminder.id)
        }
      } catch (error) {
        console.error(`Error processing reminder ${reminder.id}:`, error)
        await this.supabase.from("reminders").update({ status: "failed" }).eq("id", reminder.id)
      }
    }
  }

  private async sendReminder(reminder: Reminder): Promise<boolean> {
    const deliveryMethods = reminder.delivery_methods || ["email"]
    let success = false

    for (const method of deliveryMethods) {
      try {
        switch (method) {
          case "email":
            success = await this.sendEmailReminder(reminder)
            break
          case "sms":
            success = await this.sendSMSReminder(reminder)
            break
          case "whatsapp":
            success = await this.sendWhatsAppReminder(reminder)
            break
          default:
            console.warn(`Unknown delivery method: ${method}`)
        }
      } catch (error) {
        console.error(`Error sending ${method} reminder:`, error)
      }
    }

    return success
  }

  private async sendEmailReminder(reminder: Reminder): Promise<boolean> {
    // Implementation would integrate with email service (SMTP, SendGrid, etc.)
    console.log(`Sending email reminder: ${reminder.title}`)

    // Mock implementation - replace with actual email service
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 1000)
    })
  }

  private async sendSMSReminder(reminder: Reminder): Promise<boolean> {
    // Implementation would integrate with SMS service (Twilio, Africa's Talking, etc.)
    console.log(`Sending SMS reminder: ${reminder.title}`)

    // Mock implementation - replace with actual SMS service
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 1000)
    })
  }

  private async sendWhatsAppReminder(reminder: Reminder): Promise<boolean> {
    // Implementation would integrate with WhatsApp Business API
    console.log(`Sending WhatsApp reminder: ${reminder.title}`)

    // Mock implementation - replace with actual WhatsApp service
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), 1000)
    })
  }

  private async createNotification(notification: NotificationInsert): Promise<void> {
    const { error } = await this.supabase.from("notifications").insert(notification)

    if (error) {
      console.error("Error creating notification:", error)
    }
  }

  private async createRecurringReminder(originalReminder: Reminder): Promise<void> {
    if (!originalReminder.recurring_interval || !originalReminder.due_date) return

    const nextDueDate = this.calculateNextDueDate(originalReminder.due_date, originalReminder.recurring_interval)

    const newReminder: ReminderInsert = {
      tenant_id: originalReminder.tenant_id,
      unit_id: originalReminder.unit_id,
      type: originalReminder.type,
      title: originalReminder.title,
      message: originalReminder.message,
      due_date: nextDueDate,
      days_before: originalReminder.days_before,
      delivery_methods: originalReminder.delivery_methods,
      recurring: originalReminder.recurring,
      recurring_interval: originalReminder.recurring_interval,
      priority: originalReminder.priority,
    }

    await this.createReminder(newReminder)
  }

  private calculateNextDueDate(currentDate: string, interval: string): string {
    const date = new Date(currentDate)

    switch (interval) {
      case "daily":
        date.setDate(date.getDate() + 1)
        break
      case "weekly":
        date.setDate(date.getDate() + 7)
        break
      case "monthly":
        date.setMonth(date.getMonth() + 1)
        break
      case "yearly":
        date.setFullYear(date.getFullYear() + 1)
        break
    }

    return date.toISOString().split("T")[0]
  }

  private mapReminderTypeToNotificationType(
    reminderType: string,
  ): "payment" | "reminder" | "system" | "lock" | "maintenance" {
    switch (reminderType) {
      case "payment_due":
      case "payment_overdue":
        return "payment"
      case "maintenance":
        return "maintenance"
      case "lease_expiry":
      case "general":
      default:
        return "reminder"
    }
  }

  private getActionUrl(reminderType: string): string {
    switch (reminderType) {
      case "payment_due":
      case "payment_overdue":
        return "/dashboard/payment"
      case "lease_expiry":
        return "/dashboard"
      case "maintenance":
        return "/dashboard/notifications"
      default:
        return "/dashboard"
    }
  }

  // Automated reminder creation for payment due dates
  async createPaymentReminders(): Promise<void> {
    const { data: units, error } = await this.supabase
      .from("units")
      .select(`
        *,
        users (
          id,
          name,
          email,
          phone
        ),
        notification_preferences (
          reminder_timing,
          payment_reminders,
          email_enabled,
          sms_enabled,
          whatsapp_enabled
        )
      `)
      .eq("status", "occupied")
      .not("tenant_id", "is", null)

    if (error) {
      console.error("Error fetching units for payment reminders:", error)
      return
    }

    for (const unit of units || []) {
      if (!unit.tenant_id || !unit.users) continue

      const preferences = unit.notification_preferences?.[0]
      if (!preferences?.payment_reminders) continue

      const reminderTiming = preferences.reminder_timing || 3
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + reminderTiming)

      // Check if reminder already exists for this period
      const { data: existingReminder } = await this.supabase
        .from("reminders")
        .select("id")
        .eq("tenant_id", unit.tenant_id)
        .eq("unit_id", unit.id)
        .eq("type", "payment_due")
        .eq("due_date", dueDate.toISOString().split("T")[0])
        .single()

      if (existingReminder) continue

      // Determine delivery methods based on preferences
      const deliveryMethods: string[] = []
      if (preferences.email_enabled) deliveryMethods.push("email")
      if (preferences.sms_enabled) deliveryMethods.push("sms")
      if (preferences.whatsapp_enabled) deliveryMethods.push("whatsapp")

      const reminder: ReminderInsert = {
        tenant_id: unit.tenant_id,
        unit_id: unit.id,
        type: "payment_due",
        title: `Rent Payment Due - ${unit.unit_number}`,
        message: `Your rent payment of $${unit.rent_amount} for ${unit.unit_number} is due in ${reminderTiming} days. Please make your payment to avoid late fees.`,
        due_date: dueDate.toISOString().split("T")[0],
        days_before: reminderTiming,
        delivery_methods: deliveryMethods,
        recurring: true,
        recurring_interval: "monthly",
        priority: "high",
      }

      await this.createReminder(reminder)
    }
  }

  // Create overdue payment reminders
  async createOverdueReminders(): Promise<void> {
    const { data: payments, error } = await this.supabase
      .from("payments")
      .select(`
        *,
        units (
          id,
          unit_number,
          tenant_id,
          users (
            id,
            name,
            email,
            phone
          )
        )
      `)
      .eq("status", "pending")
      .lt("due_date", new Date().toISOString().split("T")[0])

    if (error) {
      console.error("Error fetching overdue payments:", error)
      return
    }

    for (const payment of payments || []) {
      if (!payment.units?.tenant_id) continue

      const daysPastDue = Math.floor(
        (new Date().getTime() - new Date(payment.due_date).getTime()) / (1000 * 60 * 60 * 24),
      )

      // Check if overdue reminder already exists
      const { data: existingReminder } = await this.supabase
        .from("reminders")
        .select("id")
        .eq("tenant_id", payment.units.tenant_id)
        .eq("unit_id", payment.units.id)
        .eq("type", "payment_overdue")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
        .single()

      if (existingReminder) continue

      const reminder: ReminderInsert = {
        tenant_id: payment.units.tenant_id,
        unit_id: payment.units.id,
        type: "payment_overdue",
        title: `URGENT: Overdue Payment - ${payment.units.unit_number}`,
        message: `Your rent payment of $${payment.amount} for ${payment.units.unit_number} is ${daysPastDue} days overdue. Please settle this payment immediately to avoid further action.`,
        due_date: new Date().toISOString().split("T")[0],
        days_before: 0,
        delivery_methods: ["email", "sms", "whatsapp"],
        priority: "urgent",
      }

      await this.createReminder(reminder)
    }
  }
}

// Export singleton instance
export const reminderService = new ReminderService()
