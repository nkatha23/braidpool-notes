"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts"
import { TrendingUp, Users, DollarSign, Lock, Activity, Calendar } from "lucide-react"

// Mock analytics data
const userGrowthData = [
  { month: "Jan", tenants: 45, landlords: 8, total: 53 },
  { month: "Feb", tenants: 52, landlords: 10, total: 62 },
  { month: "Mar", tenants: 61, landlords: 12, total: 73 },
  { month: "Apr", tenants: 68, landlords: 15, total: 83 },
  { month: "May", tenants: 78, landlords: 18, total: 96 },
  { month: "Jun", tenants: 89, landlords: 21, total: 110 },
]

const revenueData = [
  { month: "Jan", revenue: 45600, transactions: 156 },
  { month: "Feb", revenue: 52800, transactions: 178 },
  { month: "Mar", revenue: 61200, transactions: 203 },
  { month: "Apr", revenue: 58900, transactions: 189 },
  { month: "May", revenue: 67400, transactions: 234 },
  { month: "Jun", revenue: 74200, transactions: 267 },
]

const lockActivityData = [
  { day: "Mon", locks: 45, unlocks: 43, overrides: 2 },
  { day: "Tue", locks: 52, unlocks: 48, overrides: 1 },
  { day: "Wed", locks: 38, unlocks: 41, overrides: 3 },
  { day: "Thu", locks: 61, unlocks: 58, overrides: 0 },
  { day: "Fri", locks: 73, unlocks: 69, overrides: 2 },
  { day: "Sat", locks: 29, unlocks: 31, overrides: 1 },
  { day: "Sun", locks: 34, unlocks: 36, overrides: 0 },
]

const paymentMethodsData = [
  { name: "M-Pesa", value: 42, color: "#FF9900" },
  { name: "Credit Card", value: 28, color: "#00CC00" },
  { name: "PayPal", value: 18, color: "#1A237E" },
  { name: "Bank Transfer", value: 12, color: "#dc2626" },
]

const platformUsageData = [
  { hour: "00", active: 12 },
  { hour: "04", active: 8 },
  { hour: "08", active: 45 },
  { hour: "12", active: 67 },
  { hour: "16", active: 89 },
  { hour: "20", active: 56 },
]

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState("6months")
  const [metric, setMetric] = useState("users")

  const totalUsers = userGrowthData[userGrowthData.length - 1]?.total || 0
  const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0)
  const totalTransactions = revenueData.reduce((sum, item) => sum + item.transactions, 0)
  const totalLockActions = lockActivityData.reduce((sum, item) => sum + item.locks + item.unlocks, 0)

  const growthRate =
    userGrowthData.length > 1
      ? Math.round(
          ((userGrowthData[userGrowthData.length - 1].total - userGrowthData[0].total) / userGrowthData[0].total) * 100,
        )
      : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Platform usage, revenue, and performance metrics.</p>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 days</SelectItem>
            <SelectItem value="30days">Last 30 days</SelectItem>
            <SelectItem value="6months">Last 6 months</SelectItem>
            <SelectItem value="1year">Last year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-accent">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              <TrendingUp className="inline h-3 w-3 mr-1" />+{growthRate}% growth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">${totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalTransactions}</div>
            <p className="text-xs text-muted-foreground">Payment transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lock Actions</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLockActions}</div>
            <p className="text-xs text-muted-foreground">This week</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
            <CardDescription>Platform user acquisition over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={userGrowthData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="total"
                  stackId="1"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="tenants"
                  stackId="2"
                  stroke="var(--color-primary)"
                  fill="var(--color-primary)"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="landlords"
                  stackId="3"
                  stroke="var(--color-secondary)"
                  fill="var(--color-secondary)"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue Analytics</CardTitle>
            <CardDescription>Platform revenue and transaction volume</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  formatter={(value, name) => [
                    name === "revenue" ? `$${value}` : value,
                    name === "revenue" ? "Revenue" : "Transactions",
                  ]}
                />
                <Bar yAxisId="right" dataKey="transactions" fill="var(--color-muted)" opacity={0.3} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-secondary)"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Smart Lock Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Smart Lock Activity</CardTitle>
            <CardDescription>Daily lock/unlock operations</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={lockActivityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="locks" fill="var(--color-destructive)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="unlocks" fill="var(--color-secondary)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="overrides" fill="var(--color-accent)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Distribution of payment preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentMethodsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}%`, "Usage"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {paymentMethodsData.map((method) => (
                <div key={method.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: method.color }} />
                    <span>{method.name}</span>
                  </div>
                  <span className="font-medium">{method.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Platform Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Usage</CardTitle>
            <CardDescription>Active users throughout the day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={platformUsageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip formatter={(value) => [`${value}`, "Active Users"]} />
                <Area
                  type="monotone"
                  dataKey="active"
                  stroke="var(--color-accent)"
                  fill="var(--color-accent)"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>Key platform performance indicators</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Calendar className="h-4 w-4 text-accent" />
                <span className="text-sm font-medium">Avg. Session Duration</span>
              </div>
              <div className="text-2xl font-bold text-accent">12m 34s</div>
              <p className="text-xs text-muted-foreground">+2.3% from last month</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Activity className="h-4 w-4 text-secondary" />
                <span className="text-sm font-medium">Payment Success Rate</span>
              </div>
              <div className="text-2xl font-bold text-secondary">98.7%</div>
              <p className="text-xs text-muted-foreground">Excellent performance</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Lock Response Time</span>
              </div>
              <div className="text-2xl font-bold text-primary">1.2s</div>
              <p className="text-xs text-muted-foreground">Average response</p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">User Satisfaction</span>
              </div>
              <div className="text-2xl font-bold">4.8/5</div>
              <p className="text-xs text-muted-foreground">Based on 234 reviews</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
