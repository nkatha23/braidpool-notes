"use client"

import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bell, Menu } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

interface DashboardHeaderProps {
  title: string
  description?: string
  onMenuClick?: () => void
}

export function DashboardHeader({ title, description, onMenuClick }: DashboardHeaderProps) {
  const { user } = useAuth()
  const [notificationCount] = useState(3) // Mock notification count

  const getRoleColor = (role: string) => {
    switch (role) {
      case "tenant":
        return "bg-primary text-primary-foreground"
      case "landlord":
        return "bg-secondary text-secondary-foreground"
      case "admin":
        return "bg-accent text-accent-foreground"
      default:
        return "bg-primary text-primary-foreground"
    }
  }

  const getDynamicTitle = () => {
    if (!user) return title

    const rolePrefix = user.role.charAt(0).toUpperCase() + user.role.slice(1)
    if (title === "Dashboard") {
      return `${rolePrefix} Dashboard`
    }
    return title
  }

  return (
    <header className="bg-background border-b border-border px-4 lg:px-6 h-16 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-semibold text-foreground">{getDynamicTitle()}</h1>
            {user && (
              <Badge className={getRoleColor(user.role)} variant="secondary">
                {user.role}
              </Badge>
            )}
          </div>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" className="relative" asChild>
          <Link href="/dashboard/notifications">
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground">
                {notificationCount}
              </Badge>
            )}
          </Link>
        </Button>
      </div>
    </header>
  )
}
