import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, BarChart3, Brain, Globe, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation */}
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image 
              src="/app-icon.png" 
              alt="GEO Analyser" 
              width={32} 
              height={32}
              className="rounded-lg"
            />
            <span className="text-lg font-semibold">GEO Analyser</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="outline" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24">
        <div className="text-center max-w-3xl mx-auto space-y-8">
          <div className="inline-flex items-center gap-2 text-muted-foreground text-sm px-3 py-1 bg-muted rounded-full">
            <Zap className="w-4 h-4" />
            Generative Engine Optimization
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Track how AI talks about your brand
          </h1>
          <p className="text-lg text-muted-foreground">
            Discover how ChatGPT, Claude, Gemini and other AI systems 
            present your company. Analyze sentiment, citations and recommendations.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Start for free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg">Learn more</Button>
            </Link>
          </div>
        </div>
      </section>

      <Separator />

      {/* Features */}
      <section id="features" className="bg-muted/50">
        <div className="container mx-auto px-4 py-24 space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold">What can GEO Analyser do?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Complete tool for tracking and analyzing your brand visibility in AI responses.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Globe className="w-6 h-6" />
                </div>
                <CardTitle>Multi-LLM Testing</CardTitle>
                <CardDescription>
                  Test queries across OpenAI, Anthropic, and Google AI. 
                  Compare how different AI systems present your brand.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Brain className="w-6 h-6" />
                </div>
                <CardTitle>AI Query Generation</CardTitle>
                <CardDescription>
                  Automatically generate relevant test queries in multiple languages. 
                  AI creates queries that your potential customers actually ask.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <CardTitle>Detailed Analytics</CardTitle>
                <CardDescription>
                  Track sentiment, citations, ranking positions and recommendation strength. 
                  Export results to PDF reports.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <Separator />

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24">
        <Card className="text-center">
          <CardContent className="pt-12 pb-12 space-y-6">
            <h2 className="text-3xl font-bold">Ready to get started?</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Create a free account and discover how AI systems see your brand.
            </p>
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Create account
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Image 
                src="/app-icon.png" 
                alt="GEO Analyser" 
                width={24} 
                height={24}
                className="rounded-md"
              />
              <span className="text-sm font-medium">GEO Analyser</span>
            </div>
            <p className="text-sm text-muted-foreground">© 2026 All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
