"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Lock, Unlock, Search, Shield, AlertTriangle, User, Loader2 } from "lucide-react"

interface SmartLock {
  id: string
  unit: string
  tenant: string
  status: "locked" | "unlocked" | "offline" | "error"
  batteryLevel: number
  lastActivity: string
  location: string
}

interface OverrideLog {
  id: string
  unit: string
  action: "lock" | "unlock"
  reason: string
  admin: string
  timestamp: string
  success: boolean
}

const mockLocks: SmartLock[] = [
  {
    id: "1",
    unit: "Unit 101",
    tenant: "John Smith",
    status: "locked",
    batteryLevel: 85,
    lastActivity: "2024-01-15 14:30",
    location: "Building A, Floor 1",
  },
  {
    id: "2",
    unit: "Unit 205",
    tenant: "Sarah Johnson",
    status: "unlocked",
    batteryLevel: 42,
    lastActivity: "2024-01-15 16:45",
    location: "Building A, Floor 2",
  },
  {
    id: "3",
    unit: "Unit 302",
    tenant: "Michael Brown",
    status: "offline",
    batteryLevel: 15,
    lastActivity: "2024-01-14 09:20",
    location: "Building B, Floor 3",
  },
  {
    id: "4",
    unit: "Unit 108",
    tenant: "Emily Davis",
    status: "locked",
    batteryLevel: 78,
    lastActivity: "2024-01-15 18:12",
    location: "Building A, Floor 1",
  },
  {
    id: "5",
    unit: "Unit 204",
    tenant: "David Wilson",
    status: "error",
    batteryLevel: 0,
    lastActivity: "2024-01-13 22:30",
    location: "Building A, Floor 2",
  },
]

const mockOverrideLogs: OverrideLog[] = [
  {
    id: "1",
    unit: "Unit 302",
    action: "unlock",
    reason: "Emergency maintenance access",
    admin: "Admin User",
    timestamp: "2024-01-15 10:30",
    success: true,
  },
  {
    id: "2",
    unit: "Unit 205",
    action: "lock",
    reason: "Security concern reported",
    admin: "Admin User",
    timestamp: "2024-01-14 16:45",
    success: true,
  },
  {
    id: "3",
    unit: "Unit 108",
    action: "unlock",
    reason: "Tenant locked out",
    admin: "Admin User",
    timestamp: "2024-01-14 08:20",
    success: false,
  },
  {
    id: "4",
    unit: "Unit 101",
    action: "lock",
    reason: "System malfunction override",
    admin: "Admin User",
    timestamp: "2024-01-13 14:15",
    success: true,
  },
]

export default function LockOverridePage() {
  const [locks, setLocks] = useState(mockLocks)
  const [overrideLogs] = useState(mockOverrideLogs)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [loadingLocks, setLoadingLocks] = useState<string[]>([])
  const { toast } = useToast()

  const filteredLocks = locks.filter((lock) => {
    const matchesSearch =
      lock.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lock.tenant.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || lock.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "locked":
        return "bg-destructive text-destructive-foreground"
      case "unlocked":
        return "bg-secondary text-secondary-foreground"
      case "offline":
        return "bg-muted text-muted-foreground"
      case "error":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getBatteryColor = (level: number) => {
    if (level > 50) return "text-secondary"
    if (level > 20) return "text-yellow-600"
    return "text-destructive"
  }

  const handleLockOverride = async (lockId: string, action: "lock" | "unlock", reason: string) => {
    setLoadingLocks((prev) => [...prev, lockId])

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Update lock status
      setLocks((prev) =>
        prev.map((lock) =>
          lock.id === lockId
            ? {
                ...lock,
                status: action === "lock" ? "locked" : "unlocked",
                lastActivity: new Date().toLocaleString(),
              }
            : lock,
        ),
      )

      toast({
        title: `Override successful`,
        description: `Lock ${action}ed successfully via admin override.`,
        className: "bg-accent text-accent-foreground",
      })
    } catch (error) {
      toast({
        title: "Override failed",
        description: "Failed to execute lock override. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoadingLocks((prev) => prev.filter((id) => id !== lockId))
    }
  }

  const stats = {
    total: locks.length,
    locked: locks.filter((l) => l.status === "locked").length,
    unlocked: locks.filter((l) => l.status === "unlocked").length,
    offline: locks.filter((l) => l.status === "offline").length,
    lowBattery: locks.filter((l) => l.batteryLevel < 20).length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Smart Lock Override</h2>
        <p className="text-muted-foreground">Manually control smart locks and view override activity logs.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Locks</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Smart locks managed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Locked</CardTitle>
            <Lock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.locked}</div>
            <p className="text-xs text-muted-foreground">Secured units</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unlocked</CardTitle>
            <Unlock className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{stats.unlocked}</div>
            <p className="text-xs text-muted-foreground">Open units</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.offline}</div>
            <p className="text-xs text-muted-foreground">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Battery</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.lowBattery}</div>
            <p className="text-xs text-muted-foreground">Battery warnings</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Smart Locks Control */}
        <Card>
          <CardHeader>
            <CardTitle>Smart Lock Control</CardTitle>
            <CardDescription>Override smart locks manually when needed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex space-x-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by unit or tenant..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                  <SelectItem value="unlocked">Unlocked</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Locks List */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredLocks.map((lock) => {
                const isLoading = loadingLocks.includes(lock.id)
                return (
                  <div key={lock.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          {lock.status === "locked" ? (
                            <Lock className="h-5 w-5 text-destructive" />
                          ) : lock.status === "unlocked" ? (
                            <Unlock className="h-5 w-5 text-secondary" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <h4 className="font-medium">{lock.unit}</h4>
                            <p className="text-sm text-muted-foreground">{lock.tenant}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge className={getStatusColor(lock.status)}>{lock.status}</Badge>
                        <span className={`text-sm font-medium ${getBatteryColor(lock.batteryLevel)}`}>
                          {lock.batteryLevel}%
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>{lock.location}</p>
                      <p>Last activity: {lock.lastActivity}</p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={lock.status === "offline" || isLoading}
                        onClick={() => handleLockOverride(lock.id, "lock", "Admin manual override")}
                      >
                        {isLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="mr-2 h-4 w-4" />
                        )}
                        Lock
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={lock.status === "offline" || isLoading}
                        onClick={() => handleLockOverride(lock.id, "unlock", "Admin manual override")}
                      >
                        {isLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Unlock className="mr-2 h-4 w-4" />
                        )}
                        Unlock
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Override Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Override Activity Log</CardTitle>
            <CardDescription>Recent manual lock override actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {overrideLogs.map((log) => (
                <div key={log.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {log.action === "lock" ? (
                        <Lock className="h-4 w-4 text-destructive" />
                      ) : (
                        <Unlock className="h-4 w-4 text-secondary" />
                      )}
                      <span className="font-medium">{log.unit}</span>
                      <Badge variant="outline" className={log.success ? "text-secondary" : "text-destructive"}>
                        {log.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{log.reason}</p>
                  <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <User className="h-3 w-3" />
                    <span>by {log.admin}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Emergency Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span>Emergency Actions</span>
          </CardTitle>
          <CardDescription>Quick actions for emergency situations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <Lock className="h-6 w-6 text-destructive" />
              <span className="font-medium">Lock All Units</span>
              <span className="text-xs text-muted-foreground">Emergency lockdown</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <Unlock className="h-6 w-6 text-secondary" />
              <span className="font-medium">Unlock All Units</span>
              <span className="text-xs text-muted-foreground">Emergency evacuation</span>
            </Button>
            <Button variant="outline" className="h-auto p-4 flex flex-col items-center space-y-2 bg-transparent">
              <Shield className="h-6 w-6 text-accent" />
              <span className="font-medium">System Reset</span>
              <span className="text-xs text-muted-foreground">Reset all locks</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
