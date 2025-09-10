"use client"

import { useState, useEffect, createContext, useContext, type ReactNode } from "react"

export type UserRole = "tenant" | "landlord" | "admin"

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (data: {
    name: string
    email: string
    phone: string
    password: string
    role: UserRole
  }) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const mockUsers = [
  { id: "1", name: "John Tenant", email: "tenant@demo.com", phone: "+1234567890", role: "tenant" as UserRole },
  { id: "2", name: "Sarah Landlord", email: "landlord@demo.com", phone: "+1234567891", role: "landlord" as UserRole },
  { id: "3", name: "Admin User", email: "admin@demo.com", phone: "+1234567892", role: "admin" as UserRole },
]

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  })

  useEffect(() => {
    const savedUser = localStorage.getItem("demo-user")
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser)
        setAuthState({
          user,
          isLoading: false,
          isAuthenticated: true,
        })
      } catch {
        localStorage.removeItem("demo-user")
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        })
      }
    } else {
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      })
    }
  }, [])

  const login = async (email: string, password: string) => {
    setAuthState((prev) => ({ ...prev, isLoading: true }))

    try {
      const mockUser = mockUsers.find((u) => u.email === email)

      if (!mockUser) {
        throw new Error("Invalid email or password")
      }

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      localStorage.setItem("demo-user", JSON.stringify(mockUser))

      setAuthState({
        user: mockUser,
        isLoading: false,
        isAuthenticated: true,
      })
    } catch (error) {
      setAuthState((prev) => ({ ...prev, isLoading: false }))
      throw error
    }
  }

  const register = async (data: {
    name: string
    email: string
    phone: string
    password: string
    role: UserRole
  }) => {
    setAuthState((prev) => ({ ...prev, isLoading: true }))

    try {
      const newUser: User = {
        id: Date.now().toString(),
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
      }

      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      localStorage.setItem("demo-user", JSON.stringify(newUser))

      setAuthState({
        user: newUser,
        isLoading: false,
        isAuthenticated: true,
      })
    } catch (error) {
      setAuthState((prev) => ({ ...prev, isLoading: false }))
      throw error
    }
  }

  const logout = async () => {
    localStorage.removeItem("demo-user")
    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    })
  }

  const resetPassword = async (email: string) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    // Just simulate success
  }

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        register,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
