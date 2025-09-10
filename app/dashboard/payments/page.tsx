"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
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
} from "recharts"
import { DollarSign, TrendingUp, TrendingDown, Calendar, Download } from "lucide-react"

// Mock data for charts
const monthlyData = [
  { month: "Jan", collected: 8400, expected: 9600, tenants: 8 },
  { month: "Feb", collected: 9200, expected: 9600, tenants: 8 },
  { month: "Mar", collected: 9600, expected: 9600, tenants: 8 },
  { month: "Apr", collected: 8800, expected: 9600, tenants: 8 },
  { month: "May", collected: 9400, expected: 9600, tenants: 8 },
  { month: "Jun", collected: 9600, expected: 9600, tenants: 8 },
]

const weeklyData = [
  { week: "Week 1", amount: 2400 },
  { week: "Week 2", amount: 1800 },
  { week: "Week 3", amount: 3200 },
  { week: "Week 4", amount: 2800 },
]

const paymentMethodData = [
  { name: "M-Pesa", value: 45, color: "#FF9900" },
  { name: "Credit Card", value: 30, color: "#00CC00" },
  { name: "PayPal", value: 15, color: "#1A237E" },
  { name: "Bank Transfer", value: 10, color: "#dc2626" },
]

const recentPayments = [
  { id: "1", tenant: "John Smith", unit: "Unit 101", amount: 1200, date: "2024-01-15", method: "M-Pesa" },
  { id: "2", tenant: "Emily Davis", unit: "Unit 108", amount: 1300, date: "2024-01-15", method: "Credit Card" },
  { id: "3", tenant: "Lisa Anderson", unit: "Unit 301", amount: 1350, date: "2024-01-14", method: "PayPal" },
  { id: "4", tenant: "Michael Brown", unit: "Unit 302", amount: 1100, date: "2024-01-13", method: "M-Pesa" },
  { id: "5", tenant: "Sarah Johnson", unit: "Unit 205", amount: 1400, date: "2024-01-12", method: "Bank Transfer" },
]

export default function PaymentsOverviewPage() {
  const [timeRange, setTimeRange] = useState("monthly")
  const [chartType, setChartType] = useState("bar")

  const currentData = timeRange === "monthly" ? monthlyData : weeklyData
  const totalCollected = currentData.reduce((sum, item) => sum + (item.collected || item.amount), 0)
  const totalExpected =
    timeRange === "monthly" ? monthlyData.reduce((sum, item) => sum + item.expected, 0) : totalCollected
  const collectionRate = Math.round((totalCollected / totalExpected) * 100)

  const renderChart = () => {
    if (timeRange === "weekly") {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="week" />
            <YAxis />
            <Tooltip formatter={(value) => [`$${value}`, "Amount"]} />
            <Bar dataKey="amount" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value, name) => [`$${value}`, name === "collected" ? "Collected" : "Expected"]} />
            <Line type="monotone" dataKey="collected" stroke="var(--color-secondary)" strokeWidth={3} />
            <Line type="monotone" dataKey="expected" stroke="var(--color-muted-foreground)" strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      )
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip formatter={(value, name) => [`$${value}`, name === "collected" ? "Collected" : "Expected"]} />
          <Bar dataKey="expected" fill="var(--color-muted)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="collected" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Payments Overview</h2>
        <p className="text-muted-foreground">Track your rental income and payment analytics.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
            <DollarSign className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">${totalCollected.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{timeRange === "monthly" ? "Last 6 months" : "This month"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{collectionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {collectionRate >= 90 ? "Excellent" : collectionRate >= 80 ? "Good" : "Needs attention"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              ${(totalExpected - totalCollected).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">Pending payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Payment</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${Math.round(totalCollected / (timeRange === "monthly" ? 6 : 4))}</div>
            <p className="text-xs text-muted-foreground">Per {timeRange === "monthly" ? "month" : "week"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Revenue Analytics</CardTitle>
              <CardDescription>Track your rental income over time</CardDescription>
            </div>
            <div className="flex space-x-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
              {timeRange === "monthly" && (
                <Select value={chartType} onValueChange={setChartType}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="line">Line</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent>{renderChart()}</CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Distribution of payment methods used</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentMethodData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {paymentMethodData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value}%`, "Usage"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 mt-4">
              {paymentMethodData.map((method) => (
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
      </div>

      {/* Recent Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest rent payments from your tenants</CardDescription>
          </div>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-4">
                  <div className="w-2 h-2 bg-secondary rounded-full"></div>
                  <div>
                    <p className="font-medium">{payment.tenant}</p>
                    <p className="text-sm text-muted-foreground">
                      {payment.unit} • {payment.method}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-secondary">${payment.amount}</p>
                  <p className="text-sm text-muted-foreground">{payment.date}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
