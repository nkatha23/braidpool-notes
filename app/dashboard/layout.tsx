"use client"

import type React from "react"

import { ProtectedRoute } from "@/components/protected-route"
import { DashboardSidebar } from "@/components/dashboard-sidebar"
import { DashboardHeader } from "@/components/dashboard-header"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/use-auth"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()

  const getThemeClass = () => {
    if (!user) return ""
    switch (user.role) {
      case "tenant":
        return "tenant-theme"
      case "landlord":
        return "landlord-theme"
      case "admin":
        return "admin-theme"
      default:
        return ""
    }
  }

  return (
    <ProtectedRoute>
      <div className={cn("h-screen flex overflow-hidden bg-background", getThemeClass())}>
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden bg-black/50" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <DashboardSidebar />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardHeader title="Dashboard" onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <main className="flex-1 overflow-y-auto bg-muted/30">
            <div className="p-4 lg:p-6">{children}</div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  )
}
