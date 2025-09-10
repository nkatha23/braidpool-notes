"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { Lock, Unlock, Wifi, Battery, Shield, AlertTriangle, CheckCircle, Clock, Loader2, Calendar } from "lucide-react"

interface LockStatus {
  isLocked: boolean
  batteryLevel: number
  wifiStrength: number
  lastActivity: string
  isOnline: boolean
  canControl: boolean
  reason?: string
  autoLockDate?: string
}

export default function SmartLockPage() {
  const [lockStatus, setLockStatus] = useState<LockStatus>({
    isLocked: false,
    batteryLevel: 85,
    wifiStrength: 4,
    lastActivity: "2024-01-10 14:30:00",
    isOnline: true,
    canControl: true,
  })
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const [paymentStatus] = useState<"paid" | "unpaid" | "overdue">("overdue")
  const [daysOverdue] = useState(5) // Mock days overdue

  useEffect(() => {
    const shouldAutoLock = paymentStatus === "overdue" && daysOverdue >= 3

    setLockStatus((prev) => ({
      ...prev,
      isLocked: shouldAutoLock ? true : prev.isLocked,
      canControl: paymentStatus === "paid",
      reason:
        paymentStatus !== "paid"
          ? `Payment ${paymentStatus}${daysOverdue > 0 ? ` (${daysOverdue} days)` : ""}. Smart lock controls are ${shouldAutoLock ? "locked" : "disabled"} until payment is received.`
          : undefined,
      autoLockDate: shouldAutoLock
        ? new Date(Date.now() - (daysOverdue - 3) * 24 * 60 * 60 * 1000).toLocaleDateString()
        : undefined,
    }))
  }, [paymentStatus, daysOverdue])

  const toggleLock = async () => {
    if (!lockStatus.canControl) {
      toast({
        title: "Access denied",
        description: lockStatus.reason || "You cannot control the lock at this time.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Simulate occasional failures
      const success = Math.random() > 0.1

      if (success) {
        setLockStatus((prev) => ({
          ...prev,
          isLocked: !prev.isLocked,
          lastActivity: new Date().toLocaleString(),
        }))

        toast({
          title: `Lock ${lockStatus.isLocked ? "unlocked" : "locked"}`,
          description: `Your smart lock has been ${lockStatus.isLocked ? "unlocked" : "locked"} successfully.`,
          className: "bg-secondary text-secondary-foreground",
        })
      } else {
        throw new Error("Lock operation failed")
      }
    } catch (error) {
      toast({
        title: "Operation failed",
        description: "Failed to control the lock. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const getBatteryColor = (level: number) => {
    if (level > 50) return "text-secondary"
    if (level > 20) return "text-yellow-600"
    return "text-destructive"
  }

  const getWifiStrength = (strength: number) => {
    const bars = Array.from({ length: 4 }, (_, i) => (
      <div
        key={i}
        className={`w-1 bg-current ${i < strength ? "opacity-100" : "opacity-30"}`}
        style={{ height: `${(i + 1) * 3 + 2}px` }}
      />
    ))
    return <div className="flex items-end space-x-0.5">{bars}</div>
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-secondary text-secondary-foreground"
      case "unpaid":
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
        <h2 className="text-3xl font-bold tracking-tight">Smart Lock</h2>
        <p className="text-muted-foreground">Control and monitor your smart lock remotely.</p>
      </div>

      {/* Payment Status Alert */}
      {paymentStatus !== "paid" && (
        <Alert className="border-destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Payment {paymentStatus === "overdue" ? "Overdue" : "Required"}:</strong>
            {paymentStatus === "overdue" && daysOverdue >= 3 ? (
              <>
                Your rent payment is {daysOverdue} days overdue. Smart lock has been automatically locked since{" "}
                {lockStatus.autoLockDate}.
              </>
            ) : (
              <>Your rent payment is {paymentStatus}. Smart lock controls are disabled until payment is received.</>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Lock Control */}
        <Card className="lg:col-span-1">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {lockStatus.isLocked ? (
                <Lock className="h-24 w-24 text-destructive" />
              ) : (
                <Unlock className="h-24 w-24 text-secondary" />
              )}
            </div>
            <CardTitle className="text-2xl">{lockStatus.isLocked ? "Locked" : "Unlocked"}</CardTitle>
            <CardDescription>
              Your smart lock is currently {lockStatus.isLocked ? "secured" : "open"}
              {lockStatus.autoLockDate && (
                <span className="block text-destructive mt-1">Auto-locked on {lockStatus.autoLockDate}</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-center space-x-2">
              <Badge className={getPaymentStatusColor(paymentStatus)}>
                {paymentStatus === "paid"
                  ? "Access Granted"
                  : paymentStatus === "overdue" && daysOverdue >= 3
                    ? "Auto-Locked"
                    : "Access Restricted"}
              </Badge>
              {lockStatus.isOnline ? (
                <Badge variant="outline" className="text-secondary">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Online
                </Badge>
              ) : (
                <Badge variant="outline" className="text-destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>

            <Button
              onClick={toggleLock}
              disabled={!lockStatus.canControl || isLoading || !lockStatus.isOnline}
              className="w-full h-12 text-lg font-semibold"
              variant={lockStatus.isLocked ? "default" : "secondary"}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {lockStatus.isLocked ? "Unlocking..." : "Locking..."}
                </>
              ) : (
                <>
                  {lockStatus.isLocked ? <Unlock className="mr-2 h-5 w-5" /> : <Lock className="mr-2 h-5 w-5" />}
                  {lockStatus.isLocked ? "Unlock Door" : "Lock Door"}
                </>
              )}
            </Button>

            {!lockStatus.canControl && lockStatus.reason && (
              <p className="text-sm text-muted-foreground text-center">{lockStatus.reason}</p>
            )}
          </CardContent>
        </Card>

        {/* Lock Status & Info */}
        <div className="space-y-6">
          {/* Device Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Device Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Battery className={`h-4 w-4 ${getBatteryColor(lockStatus.batteryLevel)}`} />
                  <span className="text-sm font-medium">Battery</span>
                </div>
                <span className={`font-semibold ${getBatteryColor(lockStatus.batteryLevel)}`}>
                  {lockStatus.batteryLevel}%
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wifi className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">WiFi Signal</span>
                </div>
                <div className="text-secondary">{getWifiStrength(lockStatus.wifiStrength)}</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Last Activity</span>
                </div>
                <span className="text-sm text-muted-foreground">{lockStatus.lastActivity}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Payment Status</span>
                </div>
                <Badge className={getPaymentStatusColor(paymentStatus)}>
                  {paymentStatus}
                  {paymentStatus === "overdue" && ` (${daysOverdue}d)`}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common smart lock operations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent"
                disabled={!lockStatus.canControl}
              >
                <Clock className="mr-2 h-4 w-4" />
                View Activity Log
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent"
                disabled={!lockStatus.canControl}
              >
                <Shield className="mr-2 h-4 w-4" />
                Security Settings
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent"
                disabled={!lockStatus.canControl}
              >
                <Wifi className="mr-2 h-4 w-4" />
                Connection Test
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest smart lock events and notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {lockStatus.autoLockDate && (
              <div className="flex items-center space-x-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <div className="w-2 h-2 bg-destructive rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Door auto-locked due to overdue payment</p>
                  <p className="text-xs text-muted-foreground">{lockStatus.autoLockDate}</p>
                </div>
                <Badge variant="destructive">Auto-Lock</Badge>
              </div>
            )}
            <div className="flex items-center space-x-4 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 bg-secondary rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Door unlocked successfully</p>
                <p className="text-xs text-muted-foreground">Today at 2:30 PM</p>
              </div>
              <Badge variant="outline" className="text-secondary">
                Success
              </Badge>
            </div>
            <div className="flex items-center space-x-4 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Battery level warning</p>
                <p className="text-xs text-muted-foreground">Yesterday at 9:15 AM</p>
              </div>
              <Badge variant="outline">Warning</Badge>
            </div>
            <div className="flex items-center space-x-4 p-3 bg-muted/50 rounded-lg">
              <div className="w-2 h-2 bg-secondary rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Door locked automatically</p>
                <p className="text-xs text-muted-foreground">2 days ago at 11:45 PM</p>
              </div>
              <Badge variant="outline" className="text-secondary">
                Auto
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
