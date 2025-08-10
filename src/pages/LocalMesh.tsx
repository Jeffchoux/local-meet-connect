import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

// Helper to set SEO meta tags
const setMeta = (name: string, content: string) => {
  let tag = document.querySelector(`meta[name='${name}']`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

// Wait until ICE gathering completes to get full SDP (no trickle)
async function waitForIceGathering(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
  });
}

type ChatMessage = { from: "me" | "peer"; text: string; at: number };

type FileMeta = { name: string; size: number; type: string };

type WireMessage =
  | { t: "chat"; text: string }
  | { t: "file-meta"; meta: FileMeta }
  | { t: "file-chunk"; data: ArrayBuffer }
  | { t: "file-end" };

const pcConfig: RTCConfiguration = { iceServers: [] };

const LocalMesh = () => {
  const [role, setRole] = useState<"host" | "guest">(window.location.hash === "#join" ? "guest" : "host");
  const [pc] = useState(() => new RTCPeerConnection(pcConfig));
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [localOffer, setLocalOffer] = useState("");
  const [remoteAnswer, setRemoteAnswer] = useState("");
  const [remoteOffer, setRemoteOffer] = useState("");
  const [localAnswer, setLocalAnswer] = useState("");
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outgoingText, setOutgoingText] = useState("");
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream>(new MediaStream());
  const sendingRef = useRef<{ buffer: Uint8Array[]; size: number } | null>(null);

  useEffect(() => {
    document.title = "LocalMesh — Session locale";
    setMeta(
      "description",
      "Établissez une connexion locale pair‑à‑pair pour chat, fichiers et partage d’écran."
    );
    const link = document.querySelector("link[rel='canonical']") || document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", window.location.href);
    if (!link.parentElement) document.head.appendChild(link);
  }, []);

  // Setup peer connection
  useEffect(() => {
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") {
        setConnected(true);
        toast({ title: "Connecté", description: "Connexion locale établie." });
      } else if (st === "failed" || st === "disconnected") {
        setConnected(false);
        toast({ title: "Connexion perdue", description: "Veuillez réessayer." });
      }
    };

    pc.ondatachannel = (e) => {
      const ch = e.channel;
      dataChannelRef.current = ch;
      wireDataChannel(ch);
    };

    pc.ontrack = (ev) => {
      for (const track of ev.streams[0].getTracks()) {
        remoteStreamRef.current.addTrack(track);
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
    };

    return () => pc.close();
  }, [pc]);

  const wireDataChannel = (ch: RTCDataChannel) => {
    ch.onopen = () => {
      toast({ title: "Canal prêt", description: "Messages et fichiers disponibles." });
    };
    ch.onmessage = async (ev) => {
      const data = ev.data;
      if (typeof data === "string") {
        try {
          const msg = JSON.parse(data) as WireMessage;
          if (msg.t === "chat") {
            setMessages((m) => [...m, { from: "peer", text: msg.text, at: Date.now() }]);
          } else if (msg.t === "file-meta") {
            sendingRef.current = { buffer: [], size: msg.meta.size };
          } else if (msg.t === "file-end") {
            const entry = sendingRef.current;
            if (entry) {
              const blob = new Blob(entry.buffer);
              const url = URL.createObjectURL(blob);
              toast({ title: "Fichier reçu", description: "Téléchargement lancé." });
              const a = document.createElement("a");
              a.href = url;
              a.download = `recu-${Date.now()}`;
              a.click();
              URL.revokeObjectURL(url);
              sendingRef.current = null;
            }
          }
        } catch {
          // plain text fallback
          setMessages((m) => [...m, { from: "peer", text: String(data), at: Date.now() }]);
        }
      } else if (data instanceof ArrayBuffer) {
        if (!sendingRef.current) sendingRef.current = { buffer: [], size: 0 };
        sendingRef.current.buffer.push(new Uint8Array(data));
      }
    };
  };

  const createDataChannelIfNeeded = () => {
    if (!dataChannelRef.current) {
      const ch = pc.createDataChannel("data");
      dataChannelRef.current = ch;
      wireDataChannel(ch);
    }
  };

  const createOffer = async () => {
    try {
      createDataChannelIfNeeded();
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      setLocalOffer(JSON.stringify(pc.localDescription));
      toast({ title: "Offre prête", description: "Copiez et envoyez au pair." });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Impossible de créer l’offre." });
    }
  };

  const applyAnswer = async () => {
    try {
      const desc = JSON.parse(remoteAnswer) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(desc);
      toast({ title: "Réponse appliquée" });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Réponse invalide." });
    }
  };

  const acceptOffer = async () => {
    try {
      const offer = JSON.parse(remoteOffer) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceGathering(pc);
      setLocalAnswer(JSON.stringify(pc.localDescription));
      toast({ title: "Réponse prête", description: "Renvoyez-la à l’hôte." });
    } catch (e) {
      console.error(e);
      toast({ title: "Erreur", description: "Offre invalide." });
    }
  };

  const sendChat = () => {
    if (!dataChannelRef.current || dataChannelRef.current.readyState !== "open") return;
    if (!outgoingText.trim()) return;
    const payload: WireMessage = { t: "chat", text: outgoingText };
    dataChannelRef.current.send(JSON.stringify(payload));
    setMessages((m) => [...m, { from: "me", text: outgoingText, at: Date.now() }]);
    setOutgoingText("");
  };

  const sendFile = async (file: File | null) => {
    if (!file || !dataChannelRef.current) return;
    const ch = dataChannelRef.current;
    if (ch.readyState !== "open") return;
    const meta: WireMessage = { t: "file-meta", meta: { name: file.name, size: file.size, type: file.type } };
    ch.send(JSON.stringify(meta));
    const buf = await file.arrayBuffer();
    const chunkSize = 16 * 1024;
    for (let i = 0; i < buf.byteLength; i += chunkSize) {
      ch.send(buf.slice(i, i + chunkSize));
      await new Promise((r) => setTimeout(r, 0));
    }
    ch.send(JSON.stringify({ t: "file-end" }));
    toast({ title: "Fichier envoyé" });
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
      toast({ title: "Partage d’écran lancé" });
    } catch (e) {
      console.error(e);
      toast({ title: "Autorisation refusée" });
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <h1 className="text-3xl font-bold">Session locale</h1>
      <Tabs value={role} onValueChange={(v) => setRole(v as typeof role)}>
        <TabsList>
          <TabsTrigger value="host">Hôte</TabsTrigger>
          <TabsTrigger value="guest">Invité</TabsTrigger>
        </TabsList>
        <TabsContent value="host">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Créer l’offre</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="hero" onClick={createOffer}>Générer l’offre</Button>
                <Textarea rows={6} value={localOffer} readOnly placeholder="Votre offre (SDP) apparaîtra ici" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Coller la réponse</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea rows={6} value={remoteAnswer} onChange={(e) => setRemoteAnswer(e.target.value)} placeholder="Collez la réponse de l’invité" />
                <Button onClick={applyAnswer}>Appliquer la réponse</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="guest">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Coller l’offre reçue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea rows={6} value={remoteOffer} onChange={(e) => setRemoteOffer(e.target.value)} placeholder="Collez l’offre de l’hôte" />
                <Button variant="hero" onClick={acceptOffer}>Générer la réponse</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Votre réponse</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={6} value={localAnswer} readOnly placeholder="Votre réponse (SDP) apparaîtra ici" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vidéo distante</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="aspect-video overflow-hidden rounded-md bg-muted">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full" />
            </div>
            <div className="flex gap-3">
              <Button onClick={startScreenShare} disabled={!localOffer && role === "host" && !connected && !localAnswer}>
                Partager mon écran
              </Button>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText((role === "host" ? localOffer : localAnswer) || "").then(() => toast({ title: "Copié" }))}>
                Copier {role === "host" ? "l’offre" : "la réponse"}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Chat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-48 overflow-auto rounded border p-3 space-y-2">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.from === "me" ? "text-right" : "text-left"}>
                  <span className="inline-block rounded-md bg-secondary px-2 py-1 text-sm">
                    {m.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={outgoingText} onChange={(e) => setOutgoingText(e.target.value)} placeholder="Votre message" onKeyDown={(e) => e.key === 'Enter' && sendChat()} />
              <Button onClick={sendChat}>Envoyer</Button>
            </div>
            <div className="flex items-center gap-2">
              <Input type="file" onChange={(e) => sendFile(e.target.files?.[0] || null)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LocalMesh;
