// Transcreve o áudio gravado no app (Whisper no Groq) e devolve o texto para o Mob.
// Só aceita usuário logado e tem limite diário próprio (AUDIO_LIMITE_DIARIO, padrão 60).
// Usa o segredo GROQ_API_KEY (aceita também GR0Q_API_KEY, cadastrado assim por engano).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODELO = Deno.env.get("TRANSCRICAO_MODEL") ?? "whisper-large-v3-turbo";
const LIMITE = Number(Deno.env.get("AUDIO_LIMITE_DIARIO") ?? "60");
const MAX_BYTES = 12 * 1024 * 1024;
const DICA = "Conversa de um corretor de consórcio: proposta, carta de crédito, lance embutido, contemplação, financiamento, renda fixa, parcela, entrada.";

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);

  // --- quem está chamando ---
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: u, error: eu } = await supa.auth.getUser();
  if (eu || !u?.user) return json({ erro: "nao_autenticado" }, 401);

  const chave = Deno.env.get("GROQ_API_KEY") ?? Deno.env.get("GR0Q_API_KEY");
  if (!chave) return json({ erro: "sem_chave" }, 503);

  // --- entrada ---
  let arq: FormDataEntryValue | null = null;
  try { arq = (await req.formData()).get("audio"); } catch { return json({ erro: "formulario_invalido" }, 400); }
  if (!(arq instanceof File)) return json({ erro: "sem_audio" }, 400);
  if (arq.size < 1000) return json({ erro: "audio_vazio" }, 400);
  if (arq.size > MAX_BYTES) return json({ erro: "audio_grande" }, 413);

  // --- limite diário de áudios por corretor ---
  const { data: resta, error: er } = await supa.rpc("audio_consumir", { limite: LIMITE });
  if (er) return json({ erro: "limite_indisponivel" }, 500);
  if (resta === -1) return json({ erro: "limite", limite: LIMITE }, 429);

  // --- transcrição ---
  const fd = new FormData();
  fd.append("file", arq, arq.name || "audio.webm");
  fd.append("model", MODELO);
  fd.append("language", "pt");
  fd.append("response_format", "verbose_json");
  fd.append("temperature", "0");
  fd.append("prompt", DICA);
  let r: Response;
  try {
    r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: fd, signal: AbortSignal.timeout(50000),
    });
  } catch {
    return json({ erro: "ia_indisponivel" }, 502);
  }
  if (!r.ok) {
    console.error("groq-audio", r.status, (await r.text()).slice(0, 300));
    return json({ erro: r.status === 429 ? "limite_provedor" : "ia_indisponivel" }, 502);
  }
  const j = await r.json();
  // descarta trechos de silêncio/ruído que o Whisper às vezes "inventa" e o eco da dica
  const segs = (j.segments ?? []).filter((s: any) => !(s.no_speech_prob > 0.8 && s.avg_logprob < -1));
  let texto = (Array.isArray(j.segments) ? segs.map((s: any) => s.text).join("") : (j.text ?? "")).replace(/\s+/g, " ").trim();
  if (texto.includes("Conversa de um corretor de consórcio")) texto = "";
  return json({ texto, segundos: j.duration ?? null, resta });
});
