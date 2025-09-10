"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { CreditCard, Lock, Mail, MessageSquare, Phone, Shield, Globe, Save, TestTube } from "lucide-react"

interface SystemSettings {
  platform: {
    siteName: string
    siteUrl: string
    maintenanceMode: boolean
    registrationEnabled: boolean
    emailVerificationRequired: boolean
  }
  payments: {
    mpesaEnabled: boolean
    mpesaBusinessShortCode: string
    mpesaPasskey: string
    stripeEnabled: boolean
    stripePublishableKey: string
    stripeSecretKey: string
    paypalEnabled: boolean
    paypalClientId: string
    paypalClientSecret: string
    flutterwaveEnabled: boolean
    flutterwavePublicKey: string
    flutterwaveSecretKey: string
  }
  smartLock: {
    apiEndpoint: string
    apiKey: string
    autoLockDelay: number
    overrideEnabled: boolean
    lockTimeoutMinutes: number
  }
  notifications: {
    emailEnabled: boolean
    smsEnabled: boolean
    whatsappEnabled: boolean
    whatsappApiKey: string
    emailProvider: string
    smtpHost: string
    smtpPort: string
    smtpUsername: string
    smtpPassword: string
  }
  security: {
    sessionTimeout: number
    maxLoginAttempts: number
    passwordMinLength: number
    requireStrongPasswords: boolean
    twoFactorEnabled: boolean
  }
}

const defaultSettings: SystemSettings = {
  platform: {
    siteName: "SmartRent",
    siteUrl: "https://smartrent.app",
    maintenanceMode: false,
    registrationEnabled: true,
    emailVerificationRequired: true,
  },
  payments: {
    mpesaEnabled: true,
    mpesaBusinessShortCode: "174379",
    mpesaPasskey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
    stripeEnabled: true,
    stripePublishableKey: "pk_test_...",
    stripeSecretKey: "sk_test_...",
    paypalEnabled: true,
    paypalClientId: "AYSq3RDGsmBLJE-otTkBtM-jBRd1TCQwFf9RGfwddNXWz0uFU9ztymylOhRS",
    paypalClientSecret: "EGnHDxD_qRPdaLdZz8iCr8N7_MzF-YHPTkjs6NKYQvQSBngp4PTTVWkPZRbL",
    flutterwaveEnabled: true,
    flutterwavePublicKey: "FLWPUBK_TEST-...",
    flutterwaveSecretKey: "FLWSECK_TEST-...",
  },
  smartLock: {
    apiEndpoint: "https://api.smartlock.com/v1",
    apiKey: "sl_live_...",
    autoLockDelay: 3,
    overrideEnabled: true,
    lockTimeoutMinutes: 30,
  },
  notifications: {
    emailEnabled: true,
    smsEnabled: true,
    whatsappEnabled: true,
    whatsappApiKey: "wa_live_...",
    emailProvider: "smtp",
    smtpHost: "smtp.gmail.com",
    smtpPort: "587",
    smtpUsername: "noreply@smartrent.app",
    smtpPassword: "app_password_here",
  },
  security: {
    sessionTimeout: 24,
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    requireStrongPasswords: true,
    twoFactorEnabled: false,
  },
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings)
  const [activeTab, setActiveTab] = useState("platform")
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  const updateSetting = (section: keyof SystemSettings, key: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }))
  }

  const saveSettings = async () => {
    setIsSaving(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000))

    toast({
      title: "Settings saved",
      description: "System settings have been updated successfully.",
      className: "bg-accent text-accent-foreground",
    })

    setIsSaving(false)
  }

  const testIntegration = async (integration: string) => {
    toast({
      title: `Testing ${integration}...`,
      description: "Running connection test...",
      className: "bg-secondary text-secondary-foreground",
    })

    // Simulate test
    setTimeout(() => {
      toast({
        title: `${integration} test successful`,
        description: "Integration is working correctly.",
        className: "bg-secondary text-secondary-foreground",
      })
    }, 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
          <p className="text-muted-foreground">Configure platform settings and integrations.</p>
        </div>
        <Button onClick={saveSettings} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="platform">Platform</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="smartlock">Smart Lock</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="h-5 w-5" />
                <span>Platform Configuration</span>
              </CardTitle>
              <CardDescription>Basic platform settings and features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.platform.siteName}
                    onChange={(e) => updateSetting("platform", "siteName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteUrl">Site URL</Label>
                  <Input
                    id="siteUrl"
                    value={settings.platform.siteUrl}
                    onChange={(e) => updateSetting("platform", "siteUrl", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Maintenance Mode</Label>
                    <p className="text-sm text-muted-foreground">Temporarily disable public access</p>
                  </div>
                  <Switch
                    checked={settings.platform.maintenanceMode}
                    onCheckedChange={(checked) => updateSetting("platform", "maintenanceMode", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>User Registration</Label>
                    <p className="text-sm text-muted-foreground">Allow new users to register</p>
                  </div>
                  <Switch
                    checked={settings.platform.registrationEnabled}
                    onCheckedChange={(checked) => updateSetting("platform", "registrationEnabled", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Verification Required</Label>
                    <p className="text-sm text-muted-foreground">Require email verification for new accounts</p>
                  </div>
                  <Switch
                    checked={settings.platform.emailVerificationRequired}
                    onCheckedChange={(checked) => updateSetting("platform", "emailVerificationRequired", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* M-Pesa Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5" />
                    <span>M-Pesa</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.payments.mpesaEnabled}
                      onCheckedChange={(checked) => updateSetting("payments", "mpesaEnabled", checked)}
                    />
                    <Badge variant={settings.payments.mpesaEnabled ? "default" : "secondary"}>
                      {settings.payments.mpesaEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>Configure M-Pesa payment integration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Business Short Code</Label>
                  <Input
                    value={settings.payments.mpesaBusinessShortCode}
                    onChange={(e) => updateSetting("payments", "mpesaBusinessShortCode", e.target.value)}
                    disabled={!settings.payments.mpesaEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Passkey</Label>
                  <Input
                    type="password"
                    value={settings.payments.mpesaPasskey}
                    onChange={(e) => updateSetting("payments", "mpesaPasskey", e.target.value)}
                    disabled={!settings.payments.mpesaEnabled}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("M-Pesa")}
                  disabled={!settings.payments.mpesaEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Test Connection
                </Button>
              </CardContent>
            </Card>

            {/* Stripe Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5" />
                    <span>Stripe</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.payments.stripeEnabled}
                      onCheckedChange={(checked) => updateSetting("payments", "stripeEnabled", checked)}
                    />
                    <Badge variant={settings.payments.stripeEnabled ? "default" : "secondary"}>
                      {settings.payments.stripeEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>Configure Stripe payment processing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Publishable Key</Label>
                  <Input
                    value={settings.payments.stripePublishableKey}
                    onChange={(e) => updateSetting("payments", "stripePublishableKey", e.target.value)}
                    disabled={!settings.payments.stripeEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={settings.payments.stripeSecretKey}
                    onChange={(e) => updateSetting("payments", "stripeSecretKey", e.target.value)}
                    disabled={!settings.payments.stripeEnabled}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("Stripe")}
                  disabled={!settings.payments.stripeEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Test Connection
                </Button>
              </CardContent>
            </Card>

            {/* PayPal Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5" />
                    <span>PayPal</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.payments.paypalEnabled}
                      onCheckedChange={(checked) => updateSetting("payments", "paypalEnabled", checked)}
                    />
                    <Badge variant={settings.payments.paypalEnabled ? "default" : "secondary"}>
                      {settings.payments.paypalEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>Configure PayPal payment integration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    value={settings.payments.paypalClientId}
                    onChange={(e) => updateSetting("payments", "paypalClientId", e.target.value)}
                    disabled={!settings.payments.paypalEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    type="password"
                    value={settings.payments.paypalClientSecret}
                    onChange={(e) => updateSetting("payments", "paypalClientSecret", e.target.value)}
                    disabled={!settings.payments.paypalEnabled}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("PayPal")}
                  disabled={!settings.payments.paypalEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Test Connection
                </Button>
              </CardContent>
            </Card>

            {/* Flutterwave Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="h-5 w-5" />
                    <span>Flutterwave</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={settings.payments.flutterwaveEnabled}
                      onCheckedChange={(checked) => updateSetting("payments", "flutterwaveEnabled", checked)}
                    />
                    <Badge variant={settings.payments.flutterwaveEnabled ? "default" : "secondary"}>
                      {settings.payments.flutterwaveEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>Configure Flutterwave payment processing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Public Key</Label>
                  <Input
                    value={settings.payments.flutterwavePublicKey}
                    onChange={(e) => updateSetting("payments", "flutterwavePublicKey", e.target.value)}
                    disabled={!settings.payments.flutterwaveEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={settings.payments.flutterwaveSecretKey}
                    onChange={(e) => updateSetting("payments", "flutterwaveSecretKey", e.target.value)}
                    disabled={!settings.payments.flutterwaveEnabled}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("Flutterwave")}
                  disabled={!settings.payments.flutterwaveEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Test Connection
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="smartlock" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Lock className="h-5 w-5" />
                <span>Smart Lock Configuration</span>
              </CardTitle>
              <CardDescription>Configure smart lock API and behavior settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="apiEndpoint">API Endpoint</Label>
                  <Input
                    id="apiEndpoint"
                    value={settings.smartLock.apiEndpoint}
                    onChange={(e) => updateSetting("smartLock", "apiEndpoint", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={settings.smartLock.apiKey}
                    onChange={(e) => updateSetting("smartLock", "apiKey", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="autoLockDelay">Auto-lock Delay (days)</Label>
                  <Input
                    id="autoLockDelay"
                    type="number"
                    value={settings.smartLock.autoLockDelay}
                    onChange={(e) => updateSetting("smartLock", "autoLockDelay", Number.parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Days after missed payment to auto-lock</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lockTimeout">Lock Timeout (minutes)</Label>
                  <Input
                    id="lockTimeout"
                    type="number"
                    value={settings.smartLock.lockTimeoutMinutes}
                    onChange={(e) => updateSetting("smartLock", "lockTimeoutMinutes", Number.parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Auto-lock timeout for manual unlocks</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Admin Override Enabled</Label>
                  <p className="text-sm text-muted-foreground">Allow admins to manually override locks</p>
                </div>
                <Switch
                  checked={settings.smartLock.overrideEnabled}
                  onCheckedChange={(checked) => updateSetting("smartLock", "overrideEnabled", checked)}
                />
              </div>

              <Button variant="outline" onClick={() => testIntegration("Smart Lock API")}>
                <TestTube className="mr-2 h-4 w-4" />
                Test API Connection
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Email Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-5 w-5" />
                    <span>Email Notifications</span>
                  </div>
                  <Switch
                    checked={settings.notifications.emailEnabled}
                    onCheckedChange={(checked) => updateSetting("notifications", "emailEnabled", checked)}
                  />
                </CardTitle>
                <CardDescription>Configure email notification settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>SMTP Host</Label>
                  <Input
                    value={settings.notifications.smtpHost}
                    onChange={(e) => updateSetting("notifications", "smtpHost", e.target.value)}
                    disabled={!settings.notifications.emailEnabled}
                  />
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label>SMTP Port</Label>
                    <Input
                      value={settings.notifications.smtpPort}
                      onChange={(e) => updateSetting("notifications", "smtpPort", e.target.value)}
                      disabled={!settings.notifications.emailEnabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input
                      value={settings.notifications.smtpUsername}
                      onChange={(e) => updateSetting("notifications", "smtpUsername", e.target.value)}
                      disabled={!settings.notifications.emailEnabled}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={settings.notifications.smtpPassword}
                    onChange={(e) => updateSetting("notifications", "smtpPassword", e.target.value)}
                    disabled={!settings.notifications.emailEnabled}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("Email")}
                  disabled={!settings.notifications.emailEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Send Test Email
                </Button>
              </CardContent>
            </Card>

            {/* WhatsApp Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MessageSquare className="h-5 w-5" />
                    <span>WhatsApp Notifications</span>
                  </div>
                  <Switch
                    checked={settings.notifications.whatsappEnabled}
                    onCheckedChange={(checked) => updateSetting("notifications", "whatsappEnabled", checked)}
                  />
                </CardTitle>
                <CardDescription>Configure WhatsApp Business API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>WhatsApp API Key</Label>
                  <Input
                    type="password"
                    value={settings.notifications.whatsappApiKey}
                    onChange={(e) => updateSetting("notifications", "whatsappApiKey", e.target.value)}
                    disabled={!settings.notifications.whatsappEnabled}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("WhatsApp")}
                  disabled={!settings.notifications.whatsappEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Send Test Message
                </Button>
              </CardContent>
            </Card>

            {/* SMS Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Phone className="h-5 w-5" />
                    <span>SMS Notifications</span>
                  </div>
                  <Switch
                    checked={settings.notifications.smsEnabled}
                    onCheckedChange={(checked) => updateSetting("notifications", "smsEnabled", checked)}
                  />
                </CardTitle>
                <CardDescription>Configure SMS notification service</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  SMS notifications are configured through your payment gateway providers (M-Pesa, etc.)
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testIntegration("SMS")}
                  disabled={!settings.notifications.smsEnabled}
                >
                  <TestTube className="mr-2 h-4 w-4" />
                  Send Test SMS
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Security Settings</span>
              </CardTitle>
              <CardDescription>Configure platform security and authentication settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (hours)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => updateSetting("security", "sessionTimeout", Number.parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings.security.maxLoginAttempts}
                    onChange={(e) => updateSetting("security", "maxLoginAttempts", Number.parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
                <Input
                  id="passwordMinLength"
                  type="number"
                  value={settings.security.passwordMinLength}
                  onChange={(e) => updateSetting("security", "passwordMinLength", Number.parseInt(e.target.value))}
                  className="w-32"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Require Strong Passwords</Label>
                    <p className="text-sm text-muted-foreground">
                      Require uppercase, lowercase, numbers, and special characters
                    </p>
                  </div>
                  <Switch
                    checked={settings.security.requireStrongPasswords}
                    onCheckedChange={(checked) => updateSetting("security", "requireStrongPasswords", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">Enable 2FA for admin accounts</p>
                  </div>
                  <Switch
                    checked={settings.security.twoFactorEnabled}
                    onCheckedChange={(checked) => updateSetting("security", "twoFactorEnabled", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
