import { type NextRequest, NextResponse } from "next/server"
import { reminderService } from "@/lib/services/reminder-service"

export async function GET(request: NextRequest) {
  try {
    // Verify cron job authorization (in production, use proper auth)
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[CRON] Starting reminder processing...")

    // Process pending reminders
    await reminderService.processReminders()

    // Create new payment reminders
    await reminderService.createPaymentReminders()

    // Create overdue payment reminders
    await reminderService.createOverdueReminders()

    console.log("[CRON] Reminder processing completed successfully")

    return NextResponse.json({
      success: true,
      message: "Reminders processed successfully",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("[CRON] Error processing reminders:", error)

    return NextResponse.json(
      {
        success: false,
        error: "Failed to process reminders",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  // Allow manual trigger for testing
  return GET(request)
}
