// netlify/functions/generate-gemini.js
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export default async (request) => {
  try {
    // Ping-test: GET /.netlify/functions/generate-gemini?ping=1
    const url = new URL(request.url);
    if (url.searchParams.get("ping")) {
      return new Response(JSON.stringify({ ok: true, pong: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Use POST" }), { status: 405 });
    }

    const { userText, type, tone } = await request.json();
    if (!userText || !type || !tone) {
      return new Response(JSON.stringify({ error: "Missing fields (userText, type, tone)" }), { status: 400 });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GEMINI_API_KEY" }), { status: 500 });
    }

    const systemDirectives = `
Schrijf in het Nederlands.
Als type == "Social Media": gebruik vaste sjablonen (geen onderwerpregel). Vraag om DM/privé met ordernummer.
Als type == "E-mail": genereer een volledige mail met onderwerpregel. 
  - Als de usertekst een ordernummer bevat (bijv. #12345 of 12345), maak onderwerp: "Vraag over order #<nummer>".
  - Anders: "Vraag over je bestelling".
Toon een zakelijke toon bij "Formeel" (geen emoji). 
Toon een informele, klantvriendelijke toon bij "Informeel" met spaarzame emoji (max 2, geen overdaad).
Beperk je tot de reactie zelf; geen meta-uitleg.
`.trim();

    const userPrompt = `Type: ${type}
Stijl: ${tone}

Invoer klant:
${userText}`;

    const resp = await fetch(`${API_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemDirectives }] },
          { role: "user", parts: [{ text: userPrompt }] },
        ],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: "Gemini error", details: errText }), { status: resp.status });
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Er is geen tekst gegenereerd.";

    return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 500 });
  }
};
