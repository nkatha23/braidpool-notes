export type UserRole = "tenant" | "landlord" | "admin"

export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: UserRole
  avatar?: string
}

export interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

import { createClient } from "@/lib/supabase/client"

// Mock authentication functions - replace with real API calls
export const authService = {
  async login(email: string, password: string): Promise<User> {
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    if (!data.user) throw new Error("No user returned")

    // Get user profile from our users table
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.user.id)
      .single()

    if (profileError) throw profileError

    return {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      role: profile.role as UserRole,
    }
  },

  async register(data: {
    name: string
    email: string
    phone: string
    password: string
    role: UserRole
  }): Promise<User> {
    const supabase = createClient()

    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
        data: {
          name: data.name,
          phone: data.phone,
          role: data.role,
        },
      },
    })

    if (error) throw error
    if (!authData.user) throw new Error("No user returned")

    return {
      id: authData.user.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
    }
  },

  async resetPassword(email: string): Promise<void> {
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (error) throw error
  },

  async logout(): Promise<void> {
    const supabase = createClient()
    await supabase.auth.signOut()
  },

  getCurrentUser(): User | null {
    // This will be handled by the auth context with Supabase session
    return null
  },
}
