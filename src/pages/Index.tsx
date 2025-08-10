import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { Link } from "react-router-dom";

const setMeta = (name: string, content: string) => {
  let tag = document.querySelector(`meta[name='${name}']`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

const Index = () => {
  useEffect(() => {
    document.title = "LocalMesh — Réunions locales sans internet";
    setMeta(
      "description",
      "Créez des réunions locales sur le même Wi‑Fi : chat, partage d’écran et fichiers sans internet."
    );
    const link = document.querySelector("link[rel='canonical']") || document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", window.location.href);
    if (!link.parentElement) document.head.appendChild(link);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="container flex items-center justify-between py-6">
        <div className="font-semibold text-lg">LocalMesh</div>
        <nav className="flex gap-3">
          <Link to="/local">
            <Button variant="outline">Ouvrir l’app</Button>
          </Link>
        </nav>
      </header>
      <main className="container grid lg:grid-cols-2 gap-12 py-12 items-center">
        <section className="space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Réunions locales sur le même Wi‑Fi, sans internet
          </h1>
          <p className="text-lg text-muted-foreground">
            Visioconférence, partage d’écran, chat et transfert de fichiers entre
            appareils connectés au même réseau local. 100% pair‑à‑pair.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/local">
              <Button variant="hero" size="lg">Créer une session</Button>
            </Link>
            <Link to="/local#join">
              <Button variant="secondary" size="lg">Rejoindre une session</Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Fonctionne sans serveur grâce à WebRTC avec signalisation manuelle.
          </p>
        </section>
        <section className="relative">
          <div className="rounded-xl bg-gradient-primary animate-gradient shadow-glow p-0.5">
            <div className="rounded-[calc(var(--radius)+0.25rem)] bg-card p-8">
              <ul className="space-y-4 text-sm">
                <li>• Connexion locale pair‑à‑pair</li>
                <li>• Chat en temps réel (DataChannel)</li>
                <li>• Transfert de fichiers</li>
                <li>• Partage d’écran</li>
                <li>• Aucune connexion internet requise</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <footer className="container py-8 text-sm text-muted-foreground">
        © {new Date().getFullYear()} LocalMesh
      </footer>
    </div>
  );
};

export default Index;
