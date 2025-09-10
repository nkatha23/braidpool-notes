"use client"

import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = createClient()

      try {
        // Get the session from the URL hash
        const { data, error } = await supabase.auth.getSession()

        if (error) {
          console.error("Auth callback error:", error)
          setStatus("error")
          setMessage("Failed to verify email. Please try again.")
          return
        }

        if (data.session) {
          // User is authenticated, get their profile
          const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("role")
            .eq("id", data.session.user.id)
            .single()

          if (profileError) {
            console.error("Profile fetch error:", profileError)
            // If profile doesn't exist, create it from user metadata
            const { error: insertError } = await supabase.from("users").insert({
              id: data.session.user.id,
              email: data.session.user.email,
              name: data.session.user.user_metadata.name,
              phone: data.session.user.user_metadata.phone,
              role: data.session.user.user_metadata.role,
            })

            if (insertError) {
              console.error("Profile creation error:", insertError)
              setStatus("error")
              setMessage("Failed to create user profile. Please contact support.")
              return
            }

            // Use role from metadata if profile was just created
            const userRole = data.session.user.user_metadata.role
            redirectToDashboard(userRole)
          } else {
            // Profile exists, redirect based on role
            redirectToDashboard(profile.role)
          }
        } else {
          setStatus("error")
          setMessage("No session found. Please try signing up again.")
        }
      } catch (error) {
        console.error("Callback handling error:", error)
        setStatus("error")
        setMessage("An unexpected error occurred. Please try again.")
      }
    }

    const redirectToDashboard = (role: string) => {
      setStatus("success")
      setMessage("Email verified successfully! Redirecting to your dashboard...")

      setTimeout(() => {
        switch (role) {
          case "tenant":
            router.push("/dashboard/payment")
            break
          case "landlord":
            router.push("/dashboard/properties")
            break
          case "admin":
            router.push("/dashboard/users")
            break
          default:
            router.push("/dashboard")
        }
      }, 2000)
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-accent">
              {status === "loading" && "Verifying Email..."}
              {status === "success" && "Welcome to Viworld Realtors!"}
              {status === "error" && "Verification Failed"}
            </CardTitle>
            <CardDescription>
              {status === "loading" && "Please wait while we verify your email address."}
              {status === "success" && "Your email has been verified successfully."}
              {status === "error" && "There was an issue verifying your email."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            {status === "loading" && (
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying...</span>
              </div>
            )}
            {status === "success" && (
              <div className="space-y-2">
                <div className="text-green-600 font-medium">✓ Email Verified</div>
                <div className="text-sm text-muted-foreground">Redirecting to your dashboard...</div>
              </div>
            )}
            {status === "error" && (
              <div className="space-y-2">
                <div className="text-red-600 font-medium">✗ Verification Failed</div>
                <div className="text-sm text-muted-foreground">{message}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
