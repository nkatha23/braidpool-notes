import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, Mail } from "lucide-react"
import Link from "next/link"

export default function SignUpSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-secondary/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-secondary" />
            </div>
            <CardTitle className="text-2xl font-bold text-accent">Check Your Email</CardTitle>
            <CardDescription>We've sent you a confirmation link to complete your registration</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2 text-muted-foreground">
                <Mail className="h-5 w-5" />
                <span>Confirmation email sent</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Please check your email and click the confirmation link to activate your SmartRent account. You may need
                to check your spam folder.
              </p>
            </div>

            <div className="space-y-3">
              <Button asChild className="w-full bg-primary hover:bg-primary/90 text-white">
                <Link href="/auth/login">Back to Login</Link>
              </Button>
              <Button asChild variant="outline" className="w-full bg-transparent">
                <Link href="/">Return to Homepage</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
