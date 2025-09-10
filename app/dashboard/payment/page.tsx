"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { CreditCard, Smartphone, DollarSign, Calendar, CheckCircle, Loader2 } from "lucide-react"

interface PaymentMethod {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
  available: boolean
}

interface RentMonth {
  id: string
  month: string
  year: number
  amount: number
  dueDate: string
  status: "paid" | "pending" | "overdue"
}

const paymentMethods: PaymentMethod[] = [
  {
    id: "mpesa",
    name: "M-Pesa",
    icon: Smartphone,
    description: "Pay with your mobile money",
    available: true,
  },
  {
    id: "card",
    name: "Credit/Debit Card",
    icon: CreditCard,
    description: "Visa, Mastercard, American Express",
    available: true,
  },
  {
    id: "paypal",
    name: "PayPal",
    icon: DollarSign,
    description: "Pay with your PayPal account",
    available: true,
  },
  {
    id: "stripe",
    name: "Stripe",
    icon: CreditCard,
    description: "Secure online payments",
    available: true,
  },
  {
    id: "flutterwave",
    name: "Flutterwave",
    icon: DollarSign,
    description: "African payment gateway",
    available: false,
  },
]

const mockRentMonths: RentMonth[] = [
  {
    id: "1",
    month: "January",
    year: 2024,
    amount: 1200,
    dueDate: "2024-01-15",
    status: "overdue",
  },
  {
    id: "2",
    month: "February",
    year: 2024,
    amount: 1200,
    dueDate: "2024-02-15",
    status: "pending",
  },
  {
    id: "3",
    month: "March",
    year: 2024,
    amount: 1200,
    dueDate: "2024-03-15",
    status: "pending",
  },
]

export default function PaymentPage() {
  const [selectedMonths, setSelectedMonths] = useState<string[]>(["1"])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("")
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()

  const selectedRentMonths = mockRentMonths.filter((month) => selectedMonths.includes(month.id))
  const totalAmount = selectedRentMonths.reduce((sum, month) => sum + month.amount, 0)

  const handleMonthToggle = (monthId: string) => {
    setSelectedMonths((prev) => (prev.includes(monthId) ? prev.filter((id) => id !== monthId) : [...prev, monthId]))
  }

  const handlePayment = async () => {
    if (!selectedPaymentMethod) {
      toast({
        title: "Payment method required",
        description: "Please select a payment method to continue.",
        variant: "destructive",
      })
      return
    }

    if (selectedMonths.length === 0) {
      toast({
        title: "No months selected",
        description: "Please select at least one month to pay.",
        variant: "destructive",
      })
      return
    }

    setShowConfirmation(true)
  }

  const processPayment = async () => {
    setIsProcessing(true)

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 3000))

    setIsProcessing(false)
    setShowConfirmation(false)

    // Simulate success/failure randomly
    const isSuccess = Math.random() > 0.2

    if (isSuccess) {
      toast({
        title: "Payment successful!",
        description: `Successfully paid $${totalAmount} for ${selectedMonths.length} month(s).`,
        className: "bg-secondary text-secondary-foreground",
      })
      setSelectedMonths([])
      setSelectedPaymentMethod("")
    } else {
      toast({
        title: "Payment failed",
        description: "There was an issue processing your payment. Please try again.",
        variant: "destructive",
      })
    }
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
        <h2 className="text-3xl font-bold tracking-tight">Pay Rent</h2>
        <p className="text-muted-foreground">
          Select the months you want to pay and choose your preferred payment method.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rent Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Select Months</span>
            </CardTitle>
            <CardDescription>Choose which months you want to pay for</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockRentMonths.map((month) => (
              <div
                key={month.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id={month.id}
                    checked={selectedMonths.includes(month.id)}
                    onCheckedChange={() => handleMonthToggle(month.id)}
                    disabled={month.status === "paid"}
                  />
                  <div>
                    <label htmlFor={month.id} className="font-medium cursor-pointer">
                      {month.month} {month.year}
                    </label>
                    <p className="text-sm text-muted-foreground">Due: {month.dueDate}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="font-semibold">${month.amount}</span>
                  <Badge className={getStatusColor(month.status)}>{month.status}</Badge>
                </div>
              </div>
            ))}

            {selectedMonths.length > 0 && (
              <div className="pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Amount:</span>
                  <span className="text-2xl font-bold text-primary">${totalAmount}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CreditCard className="h-5 w-5" />
              <span>Payment Method</span>
            </CardTitle>
            <CardDescription>Choose how you want to pay</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {paymentMethods.map((method) => {
              const Icon = method.icon
              return (
                <div
                  key={method.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    !method.available
                      ? "opacity-50 cursor-not-allowed bg-muted/30"
                      : selectedPaymentMethod === method.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                  }`}
                  onClick={() => method.available && setSelectedPaymentMethod(method.id)}
                >
                  <div className="flex items-center space-x-3">
                    <Icon
                      className={`h-6 w-6 ${selectedPaymentMethod === method.id ? "text-primary" : "text-muted-foreground"}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h3 className="font-medium">{method.name}</h3>
                        {!method.available && (
                          <Badge variant="outline" className="text-xs">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{method.description}</p>
                    </div>
                    {selectedPaymentMethod === method.id && <CheckCircle className="h-5 w-5 text-primary" />}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Payment Button */}
      <Card>
        <CardContent className="pt-6">
          <Button
            onClick={handlePayment}
            className="w-full h-12 text-lg font-semibold"
            disabled={selectedMonths.length === 0}
          >
            Pay ${totalAmount} Now
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Payment</DialogTitle>
            <DialogDescription>Please review your payment details before proceeding.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Months:</span>
                  <span>{selectedRentMonths.map((m) => `${m.month} ${m.year}`).join(", ")}</span>
                </div>
                <div className="flex justify-between">
                  <span>Payment Method:</span>
                  <span>{paymentMethods.find((m) => m.id === selectedPaymentMethod)?.name}</span>
                </div>
                <div className="flex justify-between font-semibold pt-2 border-t">
                  <span>Total Amount:</span>
                  <span>${totalAmount}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmation(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={processPayment} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm Payment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
