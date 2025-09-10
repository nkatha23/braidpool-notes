"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Shield,
  CreditCard,
  Bell,
  BarChart3,
  Users,
  Smartphone,
  ArrowRight,
  CheckCircle,
  Star,
  MessageCircle,
  Twitter,
  Linkedin,
} from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  const features = [
    {
      icon: Shield,
      title: "Smart Lock Integration",
      description: "Automated access control after 3 days of missed payments.",
      color: "text-emerald-600",
      bgColor: "bg-emerald-50",
    },
    {
      icon: CreditCard,
      title: "Secure Payments",
      description: "Mobile money, card, PayPal, real-time tracking.",
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      icon: Bell,
      title: "Automated Reminders",
      description: "SMS, email, WhatsApp reminders before due dates.",
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      icon: BarChart3,
      title: "Analytics & Reporting",
      description: "Income tracking, property performance metrics.",
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      icon: Users,
      title: "Multi-User Dashboard",
      description: "Separate interfaces for tenants, landlords, admins.",
      color: "text-pink-600",
      bgColor: "bg-pink-50",
    },
    {
      icon: Smartphone,
      title: "Mobile Optimized",
      description: "Works seamlessly on all devices.",
      color: "text-indigo-600",
      bgColor: "bg-indigo-50",
    },
  ]

  const steps = [
    {
      number: "01",
      title: "Sign Up",
      description: "Choose your role (Tenant, Landlord, Admin).",
      color: "bg-gradient-to-r from-emerald-500 to-emerald-600",
    },
    {
      number: "02",
      title: "Manage Easily",
      description: "Pay rent, track tenants, or manage system via dashboards.",
      color: "bg-gradient-to-r from-blue-500 to-blue-600",
    },
    {
      number: "03",
      title: "Stay Secure",
      description: "Automated payments, locks, and reminders keep everyone on track.",
      color: "bg-gradient-to-r from-orange-500 to-orange-600",
    },
  ]

  const testimonials = [
    {
      name: "Grace Wanjiku",
      role: "Property Owner, Nairobi",
      content: "SmartRent made it so easy to manage my rental house in Embu. Payments now come on time.",
      avatar: "/african-woman-smiling.jpg",
    },
    {
      name: "David Kimani",
      role: "Tenant, Mombasa",
      content: "I love that I get WhatsApp reminders—it feels local and convenient.",
      avatar: "/african-man-professional.jpg",
    },
    {
      name: "Sarah Mutua",
      role: "Property Manager, Kisumu",
      content: "The M-Pesa integration is seamless. My tenants can pay instantly without any hassle.",
      avatar: "/african-woman-professional.jpg",
    },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-50 via-blue-50 to-orange-50">
        <div className="container mx-auto px-4 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl lg:text-6xl font-bold text-blue-900 leading-tight text-balance">
                  Smart Property Management Made Simple
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed text-pretty">
                  Automate rent collection, manage smart locks, and streamline property operations with our
                  comprehensive platform.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                  <Link href="/auth/signup">
                    Get Started as Tenant
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg">
                  <Link href="/auth/signup">
                    Get Started as Landlord
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              </div>

              <Link
                href="/auth/login"
                className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium"
              >
                Admin Login
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>

            <div className="relative">
              <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <div className="w-full h-64 bg-gradient-to-br from-emerald-100 to-blue-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="h-24 w-24 text-blue-600" />
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-200 to-blue-200 rounded-2xl blur-xl opacity-60"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-blue-900 text-balance">
              Powerful Features for Modern Property Management
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto text-pretty">
              Everything you need to manage properties efficiently in one comprehensive platform.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg hover:-translate-y-1"
              >
                <CardContent className="p-8 space-y-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className={`h-6 w-6 ${feature.color}`} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-gradient-to-r from-blue-50 to-emerald-50">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-blue-900 text-balance">How SmartRent Works</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto text-pretty">
              Get started in three simple steps and transform your property management experience.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {steps.map((step, index) => (
              <div key={index} className="relative">
                <Card className="text-center p-8 border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white hover:-translate-y-1">
                  <CardContent className="space-y-6">
                    <div
                      className={`w-16 h-16 ${step.color} text-white rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto shadow-lg`}
                    >
                      {step.number}
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">{step.title}</h3>
                    <p className="text-gray-600 leading-relaxed">{step.description}</p>
                  </CardContent>
                </Card>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2">
                    <ArrowRight className="h-8 w-8 text-blue-400" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Local Context Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl lg:text-5xl font-bold text-blue-900 text-balance">
                Built for Kenya, Designed for You
              </h2>
              <p className="text-xl text-gray-600 leading-relaxed text-pretty">
                We understand local challenges like mobile payments, late rent reminders, and property access. SmartRent
                is tailored to the Kenyan market with M-Pesa integration, WhatsApp reminders, and offline-friendly
                design.
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <span className="text-gray-900 font-medium">M-Pesa Integration</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <span className="text-gray-900 font-medium">WhatsApp Reminders</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <span className="text-gray-900 font-medium">Offline-Friendly</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-6 w-6 text-emerald-600" />
                  <span className="text-gray-900 font-medium">Local Support</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="w-full h-80 bg-gradient-to-br from-orange-100 via-blue-100 to-emerald-100 rounded-2xl shadow-xl flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Shield className="h-16 w-16 text-blue-600 mx-auto" />
                  <p className="text-blue-900 font-semibold">Nairobi Skyline</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Role-Based CTAs Section */}
      <section className="py-20 bg-gradient-to-br from-orange-50 via-pink-50 to-purple-50">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-blue-900 text-balance">Choose Your Role</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto text-pretty">
              Get started with the interface designed specifically for your needs.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg overflow-hidden hover:-translate-y-2 bg-white">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300">
                  <Users className="h-10 w-10 text-emerald-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Tenant</h3>
                  <p className="text-gray-600">Pay rent, access smart locks, view payment history</p>
                </div>
                <Button asChild className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg">
                  <Link href="/auth/signup">Get Started</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg overflow-hidden hover:-translate-y-2 bg-white">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="h-10 w-10 text-blue-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Landlord</h3>
                  <p className="text-gray-600">Manage tenants, track payments, generate reports</p>
                </div>
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg">
                  <Link href="/auth/signup">Get Started</Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="group hover:shadow-xl transition-all duration-300 border-0 shadow-lg overflow-hidden hover:-translate-y-2 bg-white">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform duration-300">
                  <Shield className="h-10 w-10 text-orange-600" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-gray-900">Admin</h3>
                  <p className="text-gray-600">System management, user oversight, analytics</p>
                </div>
                <Button asChild className="w-full bg-orange-600 hover:bg-orange-700 text-white shadow-lg">
                  <Link href="/auth/login">Admin Login</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-blue-900 text-balance">What Our Users Say</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto text-pretty">
              Join thousands of satisfied users across Kenya who trust SmartRent.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white"
              >
                <CardContent className="p-8 space-y-6">
                  <div className="flex space-x-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-600 leading-relaxed italic">"{testimonial.content}"</p>
                  <div className="flex items-center space-x-4">
                    <div className="w-15 h-15 bg-gradient-to-br from-blue-400 to-emerald-400 rounded-full flex items-center justify-center">
                      <Users className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{testimonial.name}</h4>
                      <p className="text-sm text-gray-600">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gradient-to-r from-blue-900 to-blue-800 text-white py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <h3 className="text-2xl font-bold">SmartRent</h3>
              <p className="text-white/80 leading-relaxed">Smarter Property Management for Africa.</p>
              <div className="flex space-x-4">
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/10">
                  <MessageCircle className="h-5 w-5" />
                </Button>
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/10">
                  <Twitter className="h-5 w-5" />
                </Button>
                <Button size="icon" variant="ghost" className="text-white hover:bg-white/10">
                  <Linkedin className="h-5 w-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold">Product</h4>
              <div className="space-y-2">
                <Link href="/auth/signup" className="block text-white/80 hover:text-white transition-colors">
                  For Tenants
                </Link>
                <Link href="/auth/signup" className="block text-white/80 hover:text-white transition-colors">
                  For Landlords
                </Link>
                <Link href="/auth/login" className="block text-white/80 hover:text-white transition-colors">
                  Admin Portal
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold">Company</h4>
              <div className="space-y-2">
                <Link href="#" className="block text-white/80 hover:text-white transition-colors">
                  About
                </Link>
                <Link href="#" className="block text-white/80 hover:text-white transition-colors">
                  Contact
                </Link>
                <Link href="#" className="block text-white/80 hover:text-white transition-colors">
                  Careers
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-bold">Legal</h4>
              <div className="space-y-2">
                <Link href="#" className="block text-white/80 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
                <Link href="#" className="block text-white/80 hover:text-white transition-colors">
                  Terms of Service
                </Link>
                <Link href="#" className="block text-white/80 hover:text-white transition-colors">
                  Cookie Policy
                </Link>
              </div>
            </div>
          </div>

          <div className="border-t border-white/20 mt-12 pt-8 text-center">
            <p className="text-white/60">© 2024 SmartRent. All rights reserved. Built with ❤️ for Kenya.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
