"use client"

import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DollarSign, Users, Building, TrendingUp, AlertCircle, CheckCircle, Clock, CreditCard } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

// Mock data for different roles
const mockData = {
  tenant: {
    rentDue: 1200,
    dueDate: "2024-01-15",
    status: "pending",
    lastPayment: "2023-12-15",
    lockStatus: "unlocked",
    unitNumber: "Unit 205",
    propertyName: "Sunrise Apartments",
  },
  landlord: {
    totalRent: 15600,
    collected: 12400,
    outstanding: 3200,
    tenants: 8,
    overdue: 2,
    properties: 3,
    occupancyRate: 87,
  },
  admin: {
    activeTenants: 156,
    activeLandlords: 23,
    paymentsProcessed: 89,
    locksManaged: 156,
    totalRevenue: 45600,
    systemUptime: 99.9,
  },
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [paymentStatus, setPaymentStatus] = useState("pending")
  const [lockStatus, setLockStatus] = useState("unlocked")
  const { toast } = useToast()

  if (!user) return null

  const handlePayNow = () => {
    setPaymentStatus("paid")
    toast({
      title: "Payment Successful!",
      description: "Your rent payment has been processed successfully.",
      variant: "default",
    })
  }

  const handleSendReminder = () => {
    toast({
      title: "Reminder Sent!",
      description: "Payment reminder has been sent to all overdue tenants.",
      variant: "default",
    })
  }

  const handleBanUser = () => {
    toast({
      title: "User Status Updated",
      description: "User account has been suspended successfully.",
      variant: "destructive",
    })
  }

  const renderTenantDashboard = () => (
    <div className="space-y-6">
      <Card className="border-l-4 border-l-tenant bg-gradient-to-r from-green-50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-tenant">Your Rental Unit</span>
            <Badge variant="outline" className="text-tenant border-tenant bg-green-50">
              {mockData.tenant.unitNumber}
            </Badge>
          </CardTitle>
          <CardDescription>{mockData.tenant.propertyName}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Monthly Rent</p>
              <p className="text-2xl font-bold text-tenant">KES {mockData.tenant.rentDue.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Next Due Date</p>
              <p className="text-lg font-semibold">{mockData.tenant.dueDate}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-yellow-50 to-orange-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <Badge
              variant={paymentStatus === "paid" ? "default" : "secondary"}
              className={paymentStatus === "paid" ? "bg-tenant text-white" : "bg-yellow-100 text-yellow-800"}
            >
              {paymentStatus === "paid" ? "Paid" : "Pending"}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">Last paid: {mockData.tenant.lastPayment}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Smart Lock</CardTitle>
            <CheckCircle className="h-4 w-4 text-tenant" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize text-tenant">{lockStatus}</div>
            <p className="text-xs text-muted-foreground">Access granted</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pay Rent</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <Button
              className="w-full bg-tenant hover:bg-tenant/90 text-white"
              size="sm"
              onClick={handlePayNow}
              disabled={paymentStatus === "paid"}
            >
              {paymentStatus === "paid" ? "Paid ✓" : "Pay Now"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">History</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full bg-transparent border-tenant text-tenant hover:bg-tenant hover:text-white"
              size="sm"
              asChild
            >
              <Link href="/dashboard/history">View History</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your recent transactions and updates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <div className="w-2 h-2 bg-secondary rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Payment received</p>
                <p className="text-xs text-muted-foreground">December 15, 2023</p>
              </div>
              <Badge variant="outline" className="text-secondary">
                $1,200
              </Badge>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-2 h-2 bg-primary rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Rent reminder sent</p>
                <p className="text-xs text-muted-foreground">January 1, 2024</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="w-2 h-2 bg-accent rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Smart lock accessed</p>
                <p className="text-xs text-muted-foreground">January 3, 2024</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderLandlordDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-landlord" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-landlord">KES {mockData.landlord.totalRent.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Expected this month</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collected</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">KES {mockData.landlord.collected.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">79% collection rate</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-50 to-pink-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">KES {mockData.landlord.outstanding.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{mockData.landlord.overdue} tenants overdue</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-indigo-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Occupancy</CardTitle>
            <Building className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-landlord">{mockData.landlord.occupancyRate}%</div>
            <p className="text-xs text-muted-foreground">
              {mockData.landlord.tenants} of{" "}
              {Math.round(mockData.landlord.tenants / (mockData.landlord.occupancyRate / 100))} units
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader>
            <CardTitle className="text-landlord">Quick Actions</CardTitle>
            <CardDescription>Manage your properties efficiently</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start bg-landlord hover:bg-landlord/90 text-white" asChild>
              <Link href="/dashboard/tenants">
                <Users className="mr-2 h-4 w-4" />
                Manage Tenants
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start bg-transparent border-landlord text-landlord hover:bg-landlord hover:text-white"
              asChild
            >
              <Link href="/dashboard/payments">
                <DollarSign className="mr-2 h-4 w-4" />
                View Payments
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start bg-transparent border-green-500 text-green-600 hover:bg-green-500 hover:text-white"
              onClick={handleSendReminder}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Send Reminders
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest rent payments from your tenants</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-secondary rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">John Tenant - Unit 101</p>
                    <p className="text-xs text-muted-foreground">December 15, 2023</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-secondary">
                  $1,200
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-secondary rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Sarah Smith - Unit 205</p>
                    <p className="text-xs text-muted-foreground">December 14, 2023</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-secondary">
                  $1,400
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                  <div>
                    <p className="text-sm font-medium">Mike Johnson - Unit 302</p>
                    <p className="text-xs text-muted-foreground">Overdue by 3 days</p>
                  </div>
                </div>
                <Badge variant="destructive">Overdue</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderAdminDashboard = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-orange-50 to-red-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-admin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-admin">
              {mockData.admin.activeTenants + mockData.admin.activeLandlords}
            </div>
            <p className="text-xs text-muted-foreground">
              {mockData.admin.activeTenants} tenants, {mockData.admin.activeLandlords} landlords
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-emerald-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">KES {mockData.admin.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Platform revenue</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payments Processed</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{mockData.admin.paymentsProcessed}</div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Uptime</CardTitle>
            <CheckCircle className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{mockData.admin.systemUptime}%</div>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-orange-50 to-red-50">
          <CardHeader>
            <CardTitle className="text-admin">Admin Tools</CardTitle>
            <CardDescription>Platform management and oversight</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start bg-admin hover:bg-admin/90 text-white" asChild>
              <Link href="/dashboard/users">
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start bg-transparent border-admin text-admin hover:bg-admin hover:text-white"
              asChild
            >
              <Link href="/dashboard/analytics">
                <TrendingUp className="mr-2 h-4 w-4" />
                View Analytics
              </Link>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start bg-transparent border-red-500 text-red-600 hover:bg-red-500 hover:text-white"
              onClick={handleBanUser}
            >
              <AlertCircle className="mr-2 h-4 w-4" />
              Ban User
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Activity</CardTitle>
            <CardDescription>Recent platform activity and alerts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-secondary rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">New landlord registered</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
                <Badge variant="outline" className="text-secondary">
                  New
                </Badge>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Payment gateway updated</p>
                  <p className="text-xs text-muted-foreground">5 hours ago</p>
                </div>
                <Badge variant="outline">System</Badge>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-accent rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Smart lock maintenance</p>
                  <p className="text-xs text-muted-foreground">1 day ago</p>
                </div>
                <Badge variant="outline" className="text-accent">
                  Maintenance
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const getDashboardContent = () => {
    switch (user.role) {
      case "tenant":
        return renderTenantDashboard()
      case "landlord":
        return renderLandlordDashboard()
      case "admin":
        return renderAdminDashboard()
      default:
        return <div>Invalid role</div>
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Welcome back, {user.name}!</h2>
        <p className="text-muted-foreground">
          Here's what's happening with your{" "}
          {user.role === "admin" ? "platform" : user.role === "landlord" ? "properties" : "rental"} today.
        </p>
      </div>

      {getDashboardContent()}
    </div>
  )
}
