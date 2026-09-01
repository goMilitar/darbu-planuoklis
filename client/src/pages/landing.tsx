import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, BarChart3, RefreshCw, ArrowRight, CheckCircle2, Mail } from "lucide-react";
import { Link } from "wouter";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 w-full z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              SP
            </div>
            <span className="font-semibold text-lg">Sandėlio Planas</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild data-testid="button-login-email-nav">
              <Link href="/auth">
                <Mail className="mr-2 h-4 w-4" />
                El. paštu
              </Link>
            </Button>
            <Button asChild data-testid="button-login-nav">
              <a href="/api/login">Replit</a>
            </Button>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl lg:text-5xl font-serif font-bold tracking-tight leading-tight">
              Valdykite sandėlio darbus{" "}
              <span className="text-primary">efektyviai</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg">
              Kurkite dienos planus darbuotojams, sekite atlikimą realiu laiku ir analizuokite komandos našumą su išsamia analitika.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" asChild data-testid="button-login-hero">
                <Link href="/auth">
                  Pradėti nemokamai
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild data-testid="button-login-replit-hero">
                <a href="/api/login">
                  Prisijungti su Replit
                </a>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-chart-2" />
                Nemokama sistema
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-chart-2" />
                Nereikia kortelės
              </span>
            </div>
          </div>

          <div className="hidden lg:block relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-chart-2/10 rounded-2xl" />
            <div className="relative p-8 space-y-4">
              <div className="bg-card rounded-lg border border-card-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Šiandienos planas</span>
                  <span className="text-xs bg-chart-2/10 text-chart-2 px-2 py-0.5 rounded-md font-medium">Vykdoma</span>
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Prekių priėmimas", done: 45, total: 50 },
                    { name: "Inventorizacija", done: 20, total: 100 },
                    { name: "Siuntų paruošimas", done: 30, total: 30 },
                  ].map((task) => (
                    <div key={task.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{task.name}</span>
                      <span className={task.done >= task.total ? "text-chart-2 font-medium" : "text-foreground"}>
                        {task.done}/{task.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card rounded-lg border border-card-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Atlikimas</span>
                  <span className="text-2xl font-bold text-primary">87%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-card/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-serif font-bold text-center mb-12">
            Viskas ko reikia sandėlio valdymui
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: ClipboardList,
                title: "Dienos planai",
                desc: "Kurkite ir valdykite dienos darbo planus kiekvienam darbuotojui. Automatinis vakarykščių darbų perkėlimas.",
              },
              {
                icon: RefreshCw,
                title: "Automatinis perkėlimas",
                desc: "Neatlikti darbai automatiškai perkeliami į kitą dieną. Aiškus ryšys tarp dienų.",
              },
              {
                icon: BarChart3,
                title: "Išsami analitika",
                desc: "Filtruokite pagal darbuotoją, laikotarpį ir statusą. Stebėkite atlikimo procentą ir tendencijas.",
              },
            ].map((feature) => (
              <Card key={feature.title} className="bg-background/50">
                <CardContent className="p-6 space-y-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-8 px-6 border-t">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>Sandėlio Planas {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
