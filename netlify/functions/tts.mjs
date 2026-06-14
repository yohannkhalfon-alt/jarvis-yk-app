// Proxy sécurisé vers ElevenLabs — synthèse vocale premium (voix ARIA & co)
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    // Pas de clé → le front bascule automatiquement sur la voix navigateur
    return new Response(JSON.stringify({ error: "no_key" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const { text, voiceId } = await req.json();
  if (!text) {
    return new Response(JSON.stringify({ error: "texte manquant" }), { status: 400 });
  }

  const voice = voiceId || "XB0fDUnXU5powFXDhCwa"; // Charlotte par défaut (ARIA)

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2", // excellent en français
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    return new Response(JSON.stringify({ error: await res.text() }), { status: res.status });
  }

  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
};

export const config = { path: "/api/tts" };
