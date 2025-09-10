"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Settings, Key, Wifi, CreditCard, Smartphone, Shield, CheckCircle, AlertCircle, Save } from "lucide-react"

interface Integration {
  id: string
  name: string
  description: string
  category: "payment" | "lock" | "notification" | "security"
  status: "connected" | "disconnected" | "error"
  icon: React.ComponentType<{ className?: string }>
  settings: Record<string, any>
}

const integrations: Integration[] = [
  {
    id: "mpesa",
    name: "M-Pesa",
    description: "Mobile money payment gateway for Kenya",
    category: "payment",
    status: "connected",
    icon: Smartphone,
    settings: {
      consumerKey: "••••••••••••••••",
      consumerSecret: "••••••••••••••••",
      environment: "sandbox",
      shortcode: "174379",
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Global payment processing platform",
    category: "payment",
    status: "connected",
    icon: CreditCard,
    settings: {
      publishableKey: "pk_test_••••••••••••••••",
      secretKey: "sk_test_••••••••••••••••",
      webhookSecret: "whsec_••••••••••••••••",
    },
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Digital payment platform",
    category: "payment",
    status: "disconnected",
    icon: CreditCard,
    settings: {
      clientId: "",
      clientSecret: "",
      environment: "sandbox",
    },
  },
  {
    id: "smartlock-api",
    name: "SmartLock API",
    description: "IoT smart lock management system",
    category: "lock",
    status: "connected",
    icon: Shield,
    settings: {
      apiKey: "••••••••••••••••",
      baseUrl: "https://api.smartlock.com/v1",
      timeout: "30",
      retryAttempts: "3",
    },
  },
  {
    id: "twilio",
    name: "Twilio SMS",
    description: "SMS and communication services",
    category: "notification",
    status: "error",
    icon: Smartphone,
    settings: {
      accountSid: "AC••••••••••••••••",
      authToken: "••••••••••••••••",
      fromNumber: "+1234567890",
    },
  },
]

export default function IntegrationsPage() {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [settings, setSettings] = useState<Record<string, any>>({})
  const [isEditing, setIsEditing] = useState(false)
  const { toast } = useToast()

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
        return "bg-secondary text-secondary-foreground"
      case "disconnected":
        return "bg-muted text-muted-foreground"
      case "error":
        return "bg-destructive text-destructive-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
        return CheckCircle
      case "error":
        return AlertCircle
      default:
        return Settings
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "payment":
        return "text-secondary"
      case "lock":
        return "text-accent"
      case "notification":
        return "text-primary"
      case "security":
        return "text-purple-600"
      default:
        return "text-muted-foreground"
    }
  }

  const handleEditIntegration = (integration: Integration) => {
    setSelectedIntegration(integration)
    setSettings(integration.settings)
    setIsEditing(true)
  }

  const handleSaveSettings = () => {
    if (!selectedIntegration) return

    // Update the integration settings (mock)
    const updatedIntegrations = integrations.map((integration) =>
      integration.id === selectedIntegration.id
        ? { ...integration, settings, status: "connected" as const }
        : integration,
    )

    toast({
      title: "Settings saved",
      description: `${selectedIntegration.name} configuration has been updated.`,
      className: "bg-accent text-accent-foreground",
    })

    setIsEditing(false)
    setSelectedIntegration(null)
  }

  const handleTestConnection = (integration: Integration) => {
    toast({
      title: "Testing connection",
      description: `Testing ${integration.name} integration...`,
      className: "bg-accent text-accent-foreground",
    })

    // Simulate connection test
    setTimeout(() => {
      toast({
        title: "Connection successful",
        description: `${integration.name} is working correctly.`,
        className: "bg-secondary text-secondary-foreground",
      })
    }, 2000)
  }

  const stats = {
    total: integrations.length,
    connected: integrations.filter((i) => i.status === "connected").length,
    disconnected: integrations.filter((i) => i.status === "disconnected").length,
    errors: integrations.filter((i) => i.status === "error").length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">API Integrations</h2>
        <p className="text-muted-foreground">Manage payment gateways, smart lock APIs, and third-party services.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Integrations</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Available services</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connected</CardTitle>
            <CheckCircle className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{stats.connected}</div>
            <p className="text-xs text-muted-foreground">Active integrations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Disconnected</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.disconnected}</div>
            <p className="text-xs text-muted-foreground">Not configured</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.errors}</div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Integrations List */}
        <Card>
          <CardHeader>
            <CardTitle>Available Integrations</CardTitle>
            <CardDescription>Configure and manage your third-party integrations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {integrations.map((integration) => {
              const Icon = integration.icon
              const StatusIcon = getStatusIcon(integration.status)
              return (
                <div key={integration.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Icon className={`h-6 w-6 ${getCategoryColor(integration.category)}`} />
                      <div>
                        <h4 className="font-medium">{integration.name}</h4>
                        <p className="text-sm text-muted-foreground">{integration.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className={getStatusColor(integration.status)}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {integration.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" onClick={() => handleEditIntegration(integration)}>
                      <Settings className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                    {integration.status === "connected" && (
                      <Button variant="outline" size="sm" onClick={() => handleTestConnection(integration)}>
                        Test Connection
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedIntegration ? `Configure ${selectedIntegration.name}` : "Integration Settings"}
            </CardTitle>
            <CardDescription>
              {selectedIntegration
                ? `Manage ${selectedIntegration.name} configuration and API keys`
                : "Select an integration to configure its settings"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedIntegration && isEditing ? (
              <div className="space-y-4">
                {Object.entries(settings).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key} className="capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </Label>
                    {key.toLowerCase().includes("secret") || key.toLowerCase().includes("key") ? (
                      <div className="relative">
                        <Input
                          id={key}
                          type="password"
                          value={value}
                          onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={`Enter ${key}`}
                        />
                        <Key className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                      </div>
                    ) : key.toLowerCase().includes("url") || key.toLowerCase().includes("webhook") ? (
                      <Textarea
                        id={key}
                        value={value}
                        onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={`Enter ${key}`}
                        rows={2}
                      />
                    ) : (
                      <Input
                        id={key}
                        value={value}
                        onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={`Enter ${key}`}
                      />
                    )}
                  </div>
                ))}
                <div className="flex space-x-2 pt-4">
                  <Button onClick={handleSaveSettings}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select an integration from the list to configure its settings.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
          <CardDescription>Monitor the health and performance of your integrations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <CreditCard className="h-4 w-4 text-secondary" />
                <span className="text-sm font-medium">Payment Success Rate</span>
              </div>
              <div className="text-2xl font-bold text-secondary">99.2%</div>
              <p className="text-xs text-muted-foreground">Last 24 hours</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Lock API Uptime</span>
              </div>
              <div className="text-2xl font-bold text-accent">99.8%</div>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">SMS Delivery Rate</span>
              </div>
              <div className="text-2xl font-bold text-primary">97.5%</div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Wifi className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Avg Response Time</span>
              </div>
              <div className="text-2xl font-bold">245ms</div>
              <p className="text-xs text-muted-foreground">API response time</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
