"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Bell, Mail, MessageSquare, Smartphone, Settings, Check, Clock, DollarSign, Shield } from "lucide-react"

interface Notification {
  id: string
  title: string
  message: string
  type: "payment" | "reminder" | "system" | "lock"
  timestamp: string
  read: boolean
  priority: "low" | "medium" | "high"
}

interface NotificationPreferences {
  email: boolean
  sms: boolean
  whatsapp: boolean
  push: boolean
  paymentReminders: boolean
  lockAlerts: boolean
  systemUpdates: boolean
  maintenanceNotices: boolean
  reminderDays: number[]
}

const mockNotifications: Notification[] = [
  {
    id: "1",
    title: "Rent Payment Due",
    message: "Your rent payment of $1,200 is due on January 15, 2024.",
    type: "payment",
    timestamp: "2024-01-10T10:00:00Z",
    read: false,
    priority: "high",
  },
  {
    id: "2",
    title: "Smart Lock Battery Low",
    message: "Your smart lock battery is at 15%. Please replace soon.",
    type: "lock",
    timestamp: "2024-01-09T14:30:00Z",
    read: false,
    priority: "medium",
  },
  {
    id: "3",
    title: "Payment Confirmation",
    message: "Your December rent payment has been processed successfully.",
    type: "payment",
    timestamp: "2023-12-15T09:15:00Z",
    read: true,
    priority: "low",
  },
  {
    id: "4",
    title: "System Maintenance",
    message: "Scheduled maintenance will occur on January 20, 2024 from 2-4 AM.",
    type: "system",
    timestamp: "2024-01-08T16:45:00Z",
    read: true,
    priority: "medium",
  },
  {
    id: "5",
    title: "Rent Reminder",
    message: "Friendly reminder: Your rent is due in 3 days.",
    type: "reminder",
    timestamp: "2024-01-12T08:00:00Z",
    read: false,
    priority: "medium",
  },
]

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState(mockNotifications)
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    email: true,
    sms: true,
    whatsapp: false,
    push: true,
    paymentReminders: true,
    lockAlerts: true,
    systemUpdates: true,
    maintenanceNotices: true,
    reminderDays: [7, 3, 1], // Added reminder timing preferences
  })
  const { toast } = useToast()

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
    )
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
    toast({
      title: "All notifications marked as read",
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | number[]) => {
    setPreferences((prev) => ({ ...prev, [key]: value }))
    toast({
      title: "Preferences updated",
      description: "Your notification preferences have been saved.",
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const updateReminderDays = (days: string) => {
    const dayNumbers = days
      .split(",")
      .map((d) => Number.parseInt(d.trim()))
      .filter((d) => !isNaN(d) && d > 0)
    updatePreference("reminderDays", dayNumbers)
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "payment":
        return DollarSign
      case "reminder":
        return Clock
      case "system":
        return Settings
      case "lock":
        return Shield
      default:
        return Bell
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-destructive text-destructive-foreground"
      case "medium":
        return "bg-primary text-primary-foreground"
      case "low":
        return "bg-muted text-muted-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "payment":
        return "text-primary"
      case "reminder":
        return "text-yellow-600"
      case "system":
        return "text-blue-600"
      case "lock":
        return "text-secondary"
      default:
        return "text-muted-foreground"
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">Manage your notifications and preferences.</p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline">
            <Check className="mr-2 h-4 w-4" />
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Notifications List */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Bell className="h-5 w-5" />
                <span>Recent Notifications</span>
                {unreadCount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground">{unreadCount} new</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type)
                  return (
                    <div
                      key={notification.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors hover:bg-muted/50 ${
                        !notification.read ? "bg-primary/5 border-primary/20" : ""
                      }`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex items-start space-x-4">
                        <Icon className={`h-5 w-5 mt-0.5 ${getTypeColor(notification.type)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4
                              className={`font-medium ${!notification.read ? "text-foreground" : "text-muted-foreground"}`}
                            >
                              {notification.title}
                            </h4>
                            {!notification.read && <div className="w-2 h-2 bg-primary rounded-full"></div>}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{notification.message}</p>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className={getPriorityColor(notification.priority)}>
                              {notification.priority}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(notification.timestamp).toLocaleDateString()} at{" "}
                              {new Date(notification.timestamp).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Notification Preferences */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Settings className="h-5 w-5" />
                <span>Delivery Methods</span>
              </CardTitle>
              <CardDescription>Choose how you want to receive notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="email">Email</Label>
                </div>
                <Switch
                  id="email"
                  checked={preferences.email}
                  onCheckedChange={(checked) => updatePreference("email", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="sms">SMS</Label>
                </div>
                <Switch
                  id="sms"
                  checked={preferences.sms}
                  onCheckedChange={(checked) => updatePreference("sms", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                </div>
                <Switch
                  id="whatsapp"
                  checked={preferences.whatsapp}
                  onCheckedChange={(checked) => updatePreference("whatsapp", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="push">Push Notifications</Label>
                </div>
                <Switch
                  id="push"
                  checked={preferences.push}
                  onCheckedChange={(checked) => updatePreference("push", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification Types</CardTitle>
              <CardDescription>Control which types of notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="payment-reminders">Payment Reminders</Label>
                <Switch
                  id="payment-reminders"
                  checked={preferences.paymentReminders}
                  onCheckedChange={(checked) => updatePreference("paymentReminders", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="lock-alerts">Smart Lock Alerts</Label>
                <Switch
                  id="lock-alerts"
                  checked={preferences.lockAlerts}
                  onCheckedChange={(checked) => updatePreference("lockAlerts", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="system-updates">System Updates</Label>
                <Switch
                  id="system-updates"
                  checked={preferences.systemUpdates}
                  onCheckedChange={(checked) => updatePreference("systemUpdates", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="maintenance-notices">Maintenance Notices</Label>
                <Switch
                  id="maintenance-notices"
                  checked={preferences.maintenanceNotices}
                  onCheckedChange={(checked) => updatePreference("maintenanceNotices", checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reminder Timing</CardTitle>
              <CardDescription>Set when you want to receive payment reminders</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reminder-days">Days before due date</Label>
                <Select value={preferences.reminderDays.join(", ")} onValueChange={updateReminderDays}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reminder days" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7, 3, 1">7, 3, 1 days before</SelectItem>
                    <SelectItem value="7, 1">7, 1 days before</SelectItem>
                    <SelectItem value="3, 1">3, 1 days before</SelectItem>
                    <SelectItem value="1">1 day before only</SelectItem>
                    <SelectItem value="7">7 days before only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Currently set to: {preferences.reminderDays.join(", ")} days before due date
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
