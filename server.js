const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || "";

const SYSTEM_PROMPT = `Du bist ein Roblox-Entwickler-Assistent, spezialisiert auf Luau-Scripting und Roblox Studio.

Du hilfst beim:
- Schreiben von Luau-Scripts (Server, Client, Module)
- Platzieren und Konfigurieren von Parts und Models
- Debuggen und Korrigieren von Fehlern
- Erklären von Roblox-APIs

Wenn du Scripts zurückgibst, formatiere sie immer so:
<script name="ScriptName" type="Script|LocalScript|ModuleScript">
-- dein code hier
</script>

Wenn du Parts/Models erstellen willst, beschreibe sie als JSON-Befehle so:
<action type="CreatePart">
{"Name":"MeinPart","Size":{"X":4,"Y":1,"Z":4},"Position":{"X":0,"Y":0.5,"Z":0},"Color":{"R":0.2,"G":0.6,"B":1},"Anchored":true,"Material":"SmoothPlastic"}
</action>

<action type="CreateModel">
{"Name":"MeinModel","Parts":[...]}
</action>

Antworte immer auf Deutsch wenn der Nutzer auf Deutsch schreibt.`;

function sendResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    });
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/chat") {
    sendResponse(res, 404, { error: "Not found" });
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendResponse(res, 400, { error: "Invalid JSON" });
      return;
    }

    const { messages, apiKey } = parsed;
    const key = apiKey || CLAUDE_API_KEY;

    if (!key) {
      sendResponse(res, 401, { error: "Kein API Key angegeben" });
      return;
    }

    if (!messages || !Array.isArray(messages)) {
      sendResponse(res, 400, { error: "messages fehlt" });
      return;
    }

    const requestBody = JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const apiReq = https.request(options, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => (data += chunk));
      apiRes.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            sendResponse(res, 400, { error: parsed.error.message });
          } else {
            const text = parsed.content?.[0]?.text || "";
            sendResponse(res, 200, { response: text });
          }
        } catch {
          sendResponse(res, 500, { error: "Antwort konnte nicht gelesen werden" });
        }
      });
    });

    apiReq.on("error", (e) => {
      sendResponse(res, 500, { error: "Verbindungsfehler: " + e.message });
    });

    apiReq.write(requestBody);
    apiReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`Claude Roblox Proxy läuft auf Port ${PORT}`);
});
