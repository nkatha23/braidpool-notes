"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Send, MessageSquare, Mail, Phone, Users, Clock, CheckCircle } from "lucide-react"

interface Tenant {
  id: string
  name: string
  email: string
  phone: string
  unit: string
  status: "paid" | "pending" | "overdue"
  daysOverdue?: number
}

interface ReminderTemplate {
  id: string
  name: string
  subject: string
  message: string
  type: "payment" | "general" | "maintenance"
}

const mockTenants: Tenant[] = [
  {
    id: "1",
    name: "John Smith",
    email: "john@email.com",
    phone: "+254712345678",
    unit: "Unit 101",
    status: "overdue",
    daysOverdue: 5,
  },
  {
    id: "2",
    name: "Emily Davis",
    email: "emily@email.com",
    phone: "+254723456789",
    unit: "Unit 108",
    status: "pending",
  },
  { id: "3", name: "Lisa Anderson", email: "lisa@email.com", phone: "+254734567890", unit: "Unit 301", status: "paid" },
  {
    id: "4",
    name: "Michael Brown",
    email: "michael@email.com",
    phone: "+254745678901",
    unit: "Unit 302",
    status: "overdue",
    daysOverdue: 12,
  },
  {
    id: "5",
    name: "Sarah Johnson",
    email: "sarah@email.com",
    phone: "+254756789012",
    unit: "Unit 205",
    status: "pending",
  },
]

const reminderTemplates: ReminderTemplate[] = [
  {
    id: "payment-reminder",
    name: "Payment Reminder",
    subject: "Rent Payment Reminder - {unit}",
    message:
      "Dear {tenant_name},\n\nThis is a friendly reminder that your rent payment for {unit} is due. Please make your payment as soon as possible to avoid any late fees.\n\nThank you for your cooperation.\n\nBest regards,\nProperty Management",
    type: "payment",
  },
  {
    id: "overdue-notice",
    name: "Overdue Notice",
    subject: "URGENT: Overdue Rent Payment - {unit}",
    message:
      "Dear {tenant_name},\n\nYour rent payment for {unit} is now {days_overdue} days overdue. Please settle this payment immediately to avoid further action.\n\nIf you have already made the payment, please disregard this notice.\n\nBest regards,\nProperty Management",
    type: "payment",
  },
  {
    id: "general-notice",
    name: "General Notice",
    subject: "Important Notice from Property Management",
    message:
      "Dear {tenant_name},\n\nWe hope this message finds you well. We wanted to inform you about an important update regarding your tenancy at {unit}.\n\n[Please customize this message with your specific information]\n\nThank you for your attention.\n\nBest regards,\nProperty Management",
    type: "general",
  },
]

export default function BulkRemindersPage() {
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [selectedTemplate, setSelectedTemplate] = useState("")
  const [customMessage, setCustomMessage] = useState("")
  const [deliveryMethods, setDeliveryMethods] = useState<string[]>(["email"])
  const [isCustomMessage, setIsCustomMessage] = useState(false)
  const { toast } = useToast()

  const filteredTenants = mockTenants.filter((tenant) => {
    if (filterStatus === "all") return true
    return tenant.status === filterStatus
  })

  const selectedTemplate_data = reminderTemplates.find((t) => t.id === selectedTemplate)

  const handleTenantToggle = (tenantId: string) => {
    setSelectedTenants((prev) => (prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId]))
  }

  const handleSelectAll = () => {
    if (selectedTenants.length === filteredTenants.length) {
      setSelectedTenants([])
    } else {
      setSelectedTenants(filteredTenants.map((t) => t.id))
    }
  }

  const handleDeliveryMethodToggle = (method: string) => {
    setDeliveryMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]))
  }

  const sendReminders = async () => {
    if (selectedTenants.length === 0) {
      toast({
        title: "No tenants selected",
        description: "Please select at least one tenant to send reminders to.",
        variant: "destructive",
      })
      return
    }

    if (deliveryMethods.length === 0) {
      toast({
        title: "No delivery method selected",
        description: "Please select at least one delivery method.",
        variant: "destructive",
      })
      return
    }

    if (!isCustomMessage && !selectedTemplate) {
      toast({
        title: "No message template selected",
        description: "Please select a template or write a custom message.",
        variant: "destructive",
      })
      return
    }

    if (isCustomMessage && !customMessage.trim()) {
      toast({
        title: "Custom message required",
        description: "Please write your custom message.",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Sending reminders...",
      description: `Sending reminders to ${selectedTenants.length} tenant(s) via ${deliveryMethods.join(", ")}.`,
      className: "bg-secondary text-secondary-foreground",
    })

    // Simulate sending
    setTimeout(() => {
      toast({
        title: "Reminders sent successfully!",
        description: `${selectedTenants.length} reminder(s) have been sent successfully.`,
        className: "bg-secondary text-secondary-foreground",
      })

      // Reset form
      setSelectedTenants([])
      setSelectedTemplate("")
      setCustomMessage("")
      setIsCustomMessage(false)
    }, 2000)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-secondary text-secondary-foreground"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "overdue":
        return "bg-destructive text-destructive-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Bulk Reminders</h2>
        <p className="text-muted-foreground">Send payment reminders and notices to multiple tenants at once.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tenant Selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Select Tenants</span>
            </CardTitle>
            <CardDescription>Choose which tenants to send reminders to</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Label>Filter by status:</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tenants</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                {selectedTenants.length === filteredTenants.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredTenants.map((tenant) => (
                <div key={tenant.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    checked={selectedTenants.includes(tenant.id)}
                    onCheckedChange={() => handleTenantToggle(tenant.id)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-sm text-muted-foreground">{tenant.unit}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={getStatusColor(tenant.status)}>{tenant.status}</Badge>
                        {tenant.daysOverdue && (
                          <p className="text-xs text-destructive mt-1">{tenant.daysOverdue} days overdue</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-sm text-muted-foreground">
              {selectedTenants.length} of {filteredTenants.length} tenants selected
            </div>
          </CardContent>
        </Card>

        {/* Message Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5" />
              <span>Message</span>
            </CardTitle>
            <CardDescription>Configure your reminder message</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox checked={isCustomMessage} onCheckedChange={setIsCustomMessage} />
              <Label>Use custom message</Label>
            </div>

            {!isCustomMessage ? (
              <div className="space-y-2">
                <Label>Message Template</Label>
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {reminderTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplate_data && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-2">Preview:</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selectedTemplate_data.message}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Custom Message</Label>
                <Textarea
                  placeholder="Write your custom message here..."
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={6}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Delivery Methods</Label>
              <div className="space-y-2">
                {[
                  { id: "email", label: "Email", icon: Mail },
                  { id: "whatsapp", label: "WhatsApp", icon: MessageSquare },
                  { id: "sms", label: "SMS", icon: Phone },
                ].map(({ id, label, icon: Icon }) => (
                  <div key={id} className="flex items-center space-x-2">
                    <Checkbox
                      checked={deliveryMethods.includes(id)}
                      onCheckedChange={() => handleDeliveryMethodToggle(id)}
                    />
                    <Icon className="h-4 w-4" />
                    <Label>{label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={sendReminders} className="w-full">
              <Send className="mr-2 h-4 w-4" />
              Send Reminders
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Recent Reminder Activity</span>
          </CardTitle>
          <CardDescription>Track your recent reminder campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              {
                id: "1",
                type: "Payment Reminder",
                recipients: 5,
                method: "Email, WhatsApp",
                sentAt: "2024-01-15 10:30 AM",
                status: "delivered",
              },
              {
                id: "2",
                type: "Overdue Notice",
                recipients: 2,
                method: "Email, SMS",
                sentAt: "2024-01-14 2:15 PM",
                status: "delivered",
              },
              {
                id: "3",
                type: "General Notice",
                recipients: 8,
                method: "Email",
                sentAt: "2024-01-12 9:00 AM",
                status: "delivered",
              },
            ].map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <CheckCircle className="h-5 w-5 text-secondary" />
                  <div>
                    <p className="font-medium">{activity.type}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.recipients} recipients • {activity.method}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge className="bg-secondary text-secondary-foreground">{activity.status}</Badge>
                  <p className="text-sm text-muted-foreground mt-1">{activity.sentAt}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
