"use client"

import type React from "react"

import { useAuth } from "@/hooks/use-auth"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Home,
  CreditCard,
  History,
  Lock,
  Bell,
  Users,
  BarChart3,
  FileText,
  Settings,
  LogOut,
  Building,
  Shield,
  User,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavigationItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: ("tenant" | "landlord" | "admin")[]
}

const navigation: NavigationItem[] = [
  // Tenant Navigation
  { name: "Overview", href: "/dashboard", icon: Home, roles: ["tenant", "landlord", "admin"] },
  { name: "Pay Rent", href: "/dashboard/payment", icon: CreditCard, roles: ["tenant"] },
  { name: "Payment History", href: "/dashboard/history", icon: History, roles: ["tenant"] },
  { name: "Smart Lock", href: "/dashboard/lock", icon: Lock, roles: ["tenant"] },

  // Landlord Navigation
  { name: "Tenants", href: "/dashboard/tenants", icon: Users, roles: ["landlord"] },
  { name: "Payments", href: "/dashboard/payments", icon: CreditCard, roles: ["landlord"] },
  { name: "Reports", href: "/dashboard/reports", icon: FileText, roles: ["landlord"] },

  // Admin Navigation
  { name: "User Management", href: "/dashboard/users", icon: Users, roles: ["admin"] },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, roles: ["admin"] },
  { name: "Integrations", href: "/dashboard/integrations", icon: Settings, roles: ["admin"] },
  { name: "Lock Override", href: "/dashboard/lock-override", icon: Lock, roles: ["admin"] },

  // Shared Navigation
  { name: "Notifications", href: "/dashboard/notifications", icon: Bell, roles: ["tenant", "landlord", "admin"] },
]

export function DashboardSidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  if (!user) return null

  const userNavigation = navigation.filter((item) => item.roles.includes(user.role))

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "tenant":
        return User
      case "landlord":
        return Building
      case "admin":
        return Shield
      default:
        return User
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "tenant":
        return "text-primary"
      case "landlord":
        return "text-secondary"
      case "admin":
        return "text-accent"
      default:
        return "text-primary"
    }
  }

  const getRoleTheme = (role: string) => {
    switch (role) {
      case "tenant":
        return "tenant-theme"
      case "landlord":
        return "landlord-theme"
      case "admin":
        return "admin-theme"
      default:
        return "tenant-theme"
    }
  }

  const RoleIcon = getRoleIcon(user.role)

  return (
    <div className={cn("flex flex-col h-full bg-sidebar border-r border-sidebar-border", getRoleTheme(user.role))}>
      {/* Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={cn("font-semibold", getRoleColor(user.role))}>
              {user.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground truncate">{user.name}</p>
            <div className="flex items-center space-x-1">
              <RoleIcon className={cn("h-3 w-3", getRoleColor(user.role))} />
              <p className={cn("text-xs font-medium capitalize", getRoleColor(user.role))}>{user.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {userNavigation.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href

          return (
            <Link key={item.name} href={item.href}>
              <Button
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start h-10 px-3",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="mr-3 h-4 w-4" />
                {item.name}
              </Button>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start h-10 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => logout()}
        >
          <LogOut className="mr-3 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  )
}
