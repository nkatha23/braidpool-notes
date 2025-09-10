"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Download, Search, Filter, Calendar, Receipt, Eye } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Transaction {
  id: string
  date: string
  month: string
  amount: number
  method: string
  status: "completed" | "pending" | "failed"
  reference: string
  receiptUrl?: string
}

const mockTransactions: Transaction[] = [
  {
    id: "1",
    date: "2023-12-15",
    month: "December 2023",
    amount: 1200,
    method: "M-Pesa",
    status: "completed",
    reference: "TXN001234567",
    receiptUrl: "/receipts/TXN001234567.pdf",
  },
  {
    id: "2",
    date: "2023-11-15",
    month: "November 2023",
    amount: 1200,
    method: "Credit Card",
    status: "completed",
    reference: "TXN001234566",
    receiptUrl: "/receipts/TXN001234566.pdf",
  },
  {
    id: "3",
    date: "2023-10-15",
    month: "October 2023",
    amount: 1200,
    method: "PayPal",
    status: "completed",
    reference: "TXN001234565",
    receiptUrl: "/receipts/TXN001234565.pdf",
  },
  {
    id: "4",
    date: "2023-09-15",
    month: "September 2023",
    amount: 1200,
    method: "M-Pesa",
    status: "completed",
    reference: "TXN001234564",
    receiptUrl: "/receipts/TXN001234564.pdf",
  },
  {
    id: "5",
    date: "2023-08-15",
    month: "August 2023",
    amount: 1200,
    method: "Credit Card",
    status: "failed",
    reference: "TXN001234563",
  },
]

export default function PaymentHistoryPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [methodFilter, setMethodFilter] = useState("all")
  const [selectedReceipt, setSelectedReceipt] = useState<Transaction | null>(null)
  const { toast } = useToast()

  const filteredTransactions = mockTransactions.filter((transaction) => {
    const matchesSearch =
      transaction.month.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.reference.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || transaction.status === statusFilter
    const matchesMethod = methodFilter === "all" || transaction.method === methodFilter

    return matchesSearch && matchesStatus && matchesMethod
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-secondary text-secondary-foreground"
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "failed":
        return "bg-destructive text-destructive-foreground"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const exportToCsv = () => {
    const headers = ["Date", "Month", "Amount", "Method", "Status", "Reference"]
    const csvContent = [
      headers.join(","),
      ...filteredTransactions.map((t) => [t.date, t.month, t.amount, t.method, t.status, t.reference].join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "payment-history.csv"
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "Export successful",
      description: "Payment history has been exported to CSV.",
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const exportToPdf = () => {
    // Mock PDF export
    toast({
      title: "PDF Export",
      description: "PDF export functionality would be implemented here.",
      className: "bg-secondary text-secondary-foreground",
    })
  }

  const viewReceipt = (transaction: Transaction) => {
    if (transaction.receiptUrl) {
      setSelectedReceipt(transaction)
    } else {
      toast({
        title: "Receipt not available",
        description: "No receipt is available for this transaction.",
        variant: "destructive",
      })
    }
  }

  const downloadReceipt = (transaction: Transaction) => {
    if (transaction.receiptUrl) {
      // Mock receipt download
      toast({
        title: "Receipt downloaded",
        description: `Receipt for ${transaction.reference} has been downloaded.`,
        className: "bg-secondary text-secondary-foreground",
      })
    }
  }

  const totalPaid = filteredTransactions.filter((t) => t.status === "completed").reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Payment History</h2>
        <p className="text-muted-foreground">View and export your rent payment history.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-secondary">${totalPaid}</div>
            <p className="text-xs text-muted-foreground">
              {filteredTransactions.filter((t) => t.status === "completed").length} successful payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Payment</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${mockTransactions.find((t) => t.status === "completed")?.amount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {mockTransactions.find((t) => t.status === "completed")?.date}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Payment Methods</CardTitle>
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Set(mockTransactions.map((t) => t.method)).size}</div>
            <p className="text-xs text-muted-foreground">Different methods used</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Transactions</CardTitle>
          <CardDescription>Search and filter your payment history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by month or reference..."
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
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                <SelectItem value="Credit Card">Credit Card</SelectItem>
                <SelectItem value="PayPal">PayPal</SelectItem>
                <SelectItem value="Stripe">Stripe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>{filteredTransactions.length} transaction(s) found</CardDescription>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={exportToCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPdf}>
              <Download className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No transactions found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{transaction.date}</TableCell>
                      <TableCell>{transaction.month}</TableCell>
                      <TableCell className="font-semibold">${transaction.amount}</TableCell>
                      <TableCell>{transaction.method}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(transaction.status)}>{transaction.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{transaction.reference}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {transaction.receiptUrl && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => viewReceipt(transaction)}
                                className="h-8 w-8 p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => downloadReceipt(transaction)}
                                className="h-8 w-8 p-0"
                              >
                                <Receipt className="h-4 w-4" />
                              </Button>
                            </>
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

      <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription>Receipt for transaction {selectedReceipt?.reference}</DialogDescription>
          </DialogHeader>

          {selectedReceipt && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-6 rounded-lg">
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-primary">SmartRent</h3>
                  <p className="text-muted-foreground">Payment Receipt</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Transaction ID</p>
                    <p className="font-mono font-semibold">{selectedReceipt.reference}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-semibold">{selectedReceipt.date}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="font-semibold text-lg">${selectedReceipt.amount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Method</p>
                    <p className="font-semibold">{selectedReceipt.method}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Period</p>
                    <p className="font-semibold">{selectedReceipt.month}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={getStatusColor(selectedReceipt.status)}>{selectedReceipt.status}</Badge>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t text-center">
                  <p className="text-sm text-muted-foreground">
                    Thank you for your payment. This receipt serves as proof of payment.
                  </p>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => downloadReceipt(selectedReceipt)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
