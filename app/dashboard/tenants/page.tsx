"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useToast } from "@/hooks/use-toast"
import { Search, Phone, Mail, MessageSquare, Users, Building, DollarSign, UserPlus, CheckCircle, X } from "lucide-react"

interface Tenant {
  id: string
  name: string
  email: string
  phone: string
  unit: string
  propertyName: string
  rentAmount: number
  status: "paid" | "unpaid" | "overdue"
  lastPayment: string
  leaseStart: string
  leaseEnd: string
  avatar?: string
}

interface PendingTenant {
  id: string
  name: string
  email: string
  phone: string
  requestedUnit?: string
  propertyName?: string
  appliedAt: string
  status: "pending" | "approved" | "rejected"
}

const mockTenants: Tenant[] = [
  {
    id: "1",
    name: "John Smith",
    email: "john.smith@email.com",
    phone: "+254 712 345 678",
    unit: "Unit 101",
    propertyName: "Sunrise Apartments",
    rentAmount: 1200,
    status: "paid",
    lastPayment: "2024-01-15",
    leaseStart: "2023-06-01",
    leaseEnd: "2024-05-31",
  },
  {
    id: "2",
    name: "Sarah Johnson",
    email: "sarah.j@email.com",
    phone: "+254 723 456 789",
    unit: "Unit 205",
    propertyName: "Sunrise Apartments",
    rentAmount: 1400,
    status: "unpaid",
    lastPayment: "2023-12-15",
    leaseStart: "2023-03-01",
    leaseEnd: "2024-02-29",
  },
  {
    id: "3",
    name: "Michael Brown",
    email: "m.brown@email.com",
    phone: "+254 734 567 890",
    unit: "Unit 302",
    propertyName: "Garden View Complex",
    rentAmount: 1100,
    status: "overdue",
    lastPayment: "2023-11-15",
    leaseStart: "2023-01-01",
    leaseEnd: "2023-12-31",
  },
  {
    id: "4",
    name: "Emily Davis",
    email: "emily.davis@email.com",
    phone: "+254 745 678 901",
    unit: "Unit 108",
    propertyName: "Sunrise Apartments",
    rentAmount: 1300,
    status: "paid",
    lastPayment: "2024-01-15",
    leaseStart: "2023-08-01",
    leaseEnd: "2024-07-31",
  },
]

const mockPendingTenants: PendingTenant[] = [
  {
    id: "p1",
    name: "David Wilson",
    email: "d.wilson@email.com",
    phone: "+254 756 789 012",
    requestedUnit: "Unit 103",
    propertyName: "Sunrise Apartments",
    appliedAt: "2024-01-10",
    status: "pending",
  },
  {
    id: "p2",
    name: "Lisa Anderson",
    email: "lisa.a@email.com",
    phone: "+254 767 890 123",
    requestedUnit: "Unit 202",
    propertyName: "Garden View Complex",
    appliedAt: "2024-01-08",
    status: "pending",
  },
]

export default function TenantsPage() {
  const [tenants, setTenants] = useState(mockTenants)
  const [pendingTenants, setPendingTenants] = useState(mockPendingTenants)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [propertyFilter, setPropertyFilter] = useState("all")
  const [sortBy, setSortBy] = useState("name")
  const [activeTab, setActiveTab] = useState<"current" | "pending">("current")
  const [selectedTenants, setSelectedTenants] = useState<string[]>([])
  const { toast } = useToast()

  const filteredTenants = tenants
    .filter((tenant) => {
      const matchesSearch =
        tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tenant.email.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === "all" || tenant.status === statusFilter
      const matchesProperty = propertyFilter === "all" || tenant.propertyName === propertyFilter
      return matchesSearch && matchesStatus && matchesProperty
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name)
        case "unit":
          return a.unit.localeCompare(b.unit)
        case "rent":
          return b.rentAmount - a.rentAmount
        case "status":
          return a.status.localeCompare(b.status)
        default:
          return 0
      }
    })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-secondary text-secondary-foreground"
      case "unpaid":
        return "bg-yellow-100 text-yellow-800"
      case "overdue":
        return "bg-destructive text-destructive-foreground"
      case "pending":
        return "bg-blue-100 text-blue-800"
      case "approved":
        return "bg-secondary text-secondary-foreground"
      case "rejected":
        return "bg-destructive text-destructive-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const contactTenant = (tenant: Tenant, method: "phone" | "email" | "sms") => {
    let message = ""
    switch (method) {
      case "phone":
        message = `Calling ${tenant.name} at ${tenant.phone}`
        break
      case "email":
        message = `Opening email to ${tenant.email}`
        break
      case "sms":
        message = `Sending SMS to ${tenant.name}`
        break
    }

    toast({
      title: "Contact initiated",
      description: message,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const sendPaymentReminder = (tenant: Tenant) => {
    toast({
      title: "Payment reminder sent",
      description: `Reminder sent to ${tenant.name} for ${tenant.unit}`,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const sendBulkReminder = () => {
    if (selectedTenants.length === 0) {
      toast({
        title: "No tenants selected",
        description: "Please select tenants to send reminders to.",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "Bulk reminders sent",
      description: `Payment reminders sent to ${selectedTenants.length} tenant(s)`,
      className: "bg-secondary text-secondary-foreground",
    })
    setSelectedTenants([])
  }

  const approveTenant = (pendingTenant: PendingTenant) => {
    setPendingTenants((prev) => prev.filter((t) => t.id !== pendingTenant.id))

    const newTenant: Tenant = {
      id: Date.now().toString(),
      name: pendingTenant.name,
      email: pendingTenant.email,
      phone: pendingTenant.phone,
      unit: pendingTenant.requestedUnit || "TBD",
      propertyName: pendingTenant.propertyName || "TBD",
      rentAmount: 1200, // Default rent, should be set based on unit
      status: "unpaid",
      lastPayment: "",
      leaseStart: new Date().toISOString().split("T")[0],
      leaseEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    }

    setTenants((prev) => [...prev, newTenant])

    toast({
      title: "Tenant approved",
      description: `${pendingTenant.name} has been approved and added as a tenant.`,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const rejectTenant = (pendingTenant: PendingTenant) => {
    setPendingTenants((prev) => prev.filter((t) => t.id !== pendingTenant.id))

    toast({
      title: "Application rejected",
      description: `${pendingTenant.name}'s application has been rejected.`,
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const toggleTenantSelection = (tenantId: string) => {
    setSelectedTenants((prev) => (prev.includes(tenantId) ? prev.filter((id) => id !== tenantId) : [...prev, tenantId]))
  }

  const stats = {
    total: tenants.length,
    paid: tenants.filter((t) => t.status === "paid").length,
    unpaid: tenants.filter((t) => t.status === "unpaid").length,
    overdue: tenants.filter((t) => t.status === "overdue").length,
    pending: pendingTenants.length,
    totalRent: tenants.reduce((sum, t) => sum + t.rentAmount, 0),
  }

  const properties = Array.from(new Set(tenants.map((t) => t.propertyName)))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
          <p className="text-muted-foreground">Manage your tenants and track their payment status.</p>
        </div>
        <div className="flex space-x-2">
          {selectedTenants.length > 0 && (
            <Button onClick={sendBulkReminder} variant="outline">
              <MessageSquare className="mr-2 h-4 w-4" />
              Send Reminders ({selectedTenants.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tenants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Active leases</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
            <DollarSign className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">{stats.paid}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((stats.paid / stats.total) * 100)}% collection rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unpaid</CardTitle>
            <Building className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.unpaid}</div>
            <p className="text-xs text-muted-foreground">Pending payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Building className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Applications</CardTitle>
            <UserPlus className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg w-fit">
        <Button
          variant={activeTab === "current" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("current")}
        >
          Current Tenants ({stats.total})
        </Button>
        <Button
          variant={activeTab === "pending" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("pending")}
        >
          Pending Applications ({stats.pending})
        </Button>
      </div>

      {activeTab === "current" && (
        <>
          {/* Filters and Search */}
          <Card>
            <CardHeader>
              <CardTitle>Filter Tenants</CardTitle>
              <CardDescription>Search and filter your tenant list</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, unit, or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={propertyFilter} onValueChange={setPropertyFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {properties.map((property) => (
                      <SelectItem key={property} value={property}>
                        {property}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="unit">Unit</SelectItem>
                    <SelectItem value="rent">Rent Amount</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Tenants Table */}
          <Card>
            <CardHeader>
              <CardTitle>Tenant List</CardTitle>
              <CardDescription>{filteredTenants.length} tenant(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={selectedTenants.length === filteredTenants.length && filteredTenants.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTenants(filteredTenants.map((t) => t.id))
                            } else {
                              setSelectedTenants([])
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Rent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Payment</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTenants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No tenants found matching your criteria.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedTenants.includes(tenant.id)}
                              onChange={() => toggleTenantSelection(tenant.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {tenant.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{tenant.name}</div>
                                <div className="text-sm text-muted-foreground">{tenant.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{tenant.propertyName}</TableCell>
                          <TableCell className="font-medium">{tenant.unit}</TableCell>
                          <TableCell className="font-semibold">${tenant.rentAmount}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(tenant.status)}>{tenant.status}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{tenant.lastPayment || "Never"}</TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => contactTenant(tenant, "phone")}
                                className="h-8 w-8 p-0"
                              >
                                <Phone className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => contactTenant(tenant, "email")}
                                className="h-8 w-8 p-0"
                              >
                                <Mail className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => contactTenant(tenant, "sms")}
                                className="h-8 w-8 p-0"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                              {tenant.status !== "paid" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => sendPaymentReminder(tenant)}
                                  className="text-xs"
                                >
                                  Remind
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "pending" && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Applications</CardTitle>
            <CardDescription>Review and approve tenant applications</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingTenants.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pending applications</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingTenants.map((pendingTenant) => (
                  <div key={pendingTenant.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>
                            {pendingTenant.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h4 className="font-medium">{pendingTenant.name}</h4>
                          <p className="text-sm text-muted-foreground">{pendingTenant.email}</p>
                          <p className="text-sm text-muted-foreground">{pendingTenant.phone}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {pendingTenant.requestedUnit} • {pendingTenant.propertyName}
                        </p>
                        <p className="text-xs text-muted-foreground">Applied: {pendingTenant.appliedAt}</p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rejectTenant(pendingTenant)}
                        className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => approveTenant(pendingTenant)}
                        className="bg-secondary hover:bg-secondary/90"
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
