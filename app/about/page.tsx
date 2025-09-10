import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Target, Heart, ArrowRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function AboutPage() {
  //const team = [
    //{
      //name: "Sarah Wanjiku",
      //role: "CEO & Founder",
      //bio: "Former property manager with 10+ years experience in Kenyan real estate.",
      //avatar: "/african-woman-professional.jpg",
    //},
    //{
      //name: "David Kimani",
      //role: "CTO",
      //bio: "Software engineer passionate about solving local challenges with technology.",
      //avatar: "/african-man-professional.jpg",
    //},
    //{
      //name: "Grace Mutua",
      //role: "Head of Operations",
      //bio: "Operations expert focused on streamlining property management processes.",
      //avatar: "/african-woman-smiling.jpg",
    //},
  //]

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="py-20 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-6 max-w-4xl mx-auto">
            <h1 className="text-4xl lg:text-6xl font-bold text-accent text-balance">About SmartRent</h1>
            <p className="text-xl text-muted-foreground leading-relaxed text-pretty">
              SmartRent is a Kenya-first property management solution simplifying rent payments, smart locks, and
              reminders for tenants and landlords.
            </p>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto">
                  <Target className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-2xl font-bold text-accent">Our Mission</h3>
                <p className="text-muted-foreground leading-relaxed">
                  To revolutionize property management in Kenya by providing innovative, locally-tailored solutions that
                  make rent collection seamless, secure, and stress-free for both tenants and landlords.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardContent className="p-8 text-center space-y-6">
                <div className="w-16 h-16 bg-secondary/10 rounded-2xl flex items-center justify-center mx-auto">
                  <Heart className="h-8 w-8 text-secondary" />
                </div>
                <h3 className="text-2xl font-bold text-accent">Our Vision</h3>
                <p className="text-muted-foreground leading-relaxed">
                  To become Africa's leading property management platform, empowering property owners and tenants with
                  smart technology that understands and serves local needs.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl lg:text-5xl font-bold text-accent text-balance">Meet Our Team</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
              Passionate professionals dedicated to transforming property management in Kenya.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {team.map((member, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
                <CardContent className="p-8 text-center space-y-6">
                  <div className="relative">
                    <Image
                      src={member.avatar || "/placeholder.svg"}
                      alt={member.name}
                      width={120}
                      height={120}
                      className="rounded-full mx-auto group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-accent">{member.name}</h3>
                    <p className="text-primary font-medium">{member.role}</p>
                    <p className="text-muted-foreground leading-relaxed">{member.bio}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <h2 className="text-3xl lg:text-5xl font-bold text-accent text-balance">Join SmartRent Today</h2>
            <p className="text-xl text-muted-foreground text-pretty">
              Ready to experience the future of property management? Join thousands of satisfied users across Kenya.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="bg-primary hover:bg-primary/90 text-white">
                <Link href="/auth/sign-up?role=tenant">
                  Get Started as Tenant
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-secondary text-secondary hover:bg-secondary hover:text-white bg-transparent"
              >
                <Link href="/auth/sign-up?role=landlord">
                  Get Started as Landlord
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
