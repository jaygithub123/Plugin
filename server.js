const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const SYSTEM_PROMPT = `You are an AI directly integrated into Roblox Studio via a plugin. You have DIRECT access to the user's Roblox game and can insert scripts and create parts instantly.

IMPORTANT: You ARE inside Roblox Studio. You CAN modify the game. Never say you cannot access Roblox Studio or cannot make changes - you are already integrated inside it.

When the user asks you to do ANYTHING in their game - DO IT immediately by outputting the correct format. Always take action, never just explain.

Examples of what you can do:
- "delete the map" -> write a Script that clears workspace children
- "create a part" -> use the CreatePart action format
- "fix my script" -> return the fixed code in script tags
- "make a coin system" -> write complete working scripts immediately
- "add NPCs" -> write a complete NPC script

ALWAYS respond in the same language the user writes in (German -> German, English -> English).
ALWAYS write COMPLETE working code - never use placeholder comments.
ALWAYS take action immediately - output code right away, keep explanations short.

To insert a script directly into Studio (automatically inserted):
<script name="ScriptName" type="Script|LocalScript|ModuleScript">
-- complete working code here
</script>

To create a Part directly in Workspace:
<action type="CreatePart">
{"Name":"PartName","Size":{"X":4,"Y":1,"Z":4},"Position":{"X":0,"Y":0.5,"Z":0},"Color":{"R":1,"G":0.3,"B":0.3},"Anchored":true,"Material":"SmoothPlastic"}
</action>

YOUR EXPERTISE:
- Luau scripting (strict typing, OOP, functional patterns)
- All Roblox services: DataStoreService, TweenService, RemoteEvents, BindableEvents, CollectionService, RunService, PhysicsService, MarketplaceService
- Game systems: inventories, leaderstats, datastores, combat, AI NPCs, obby, simulators, tycoons
- Performance optimization, memory management, no memory leaks
- Client-server architecture and security (never trust the client)
- UI with ScreenGui, BillboardGui, SurfaceGui
- Animations, tweening, particle effects

CODING STANDARDS:
- Use services at the top: local Players = game:GetService("Players")
- Protect remote events with server-side validation
- Use pcall() for DataStore operations
- Clean up connections with :Disconnect()
- Comment complex logic in the user's language`;

function sendResponse(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
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
    const key = apiKey || GEMINI_API_KEY;

    if (!key) {
      sendResponse(res, 401, { error: "Kein API Key angegeben" });
      return;
    }

    if (!messages || !Array.isArray(messages)) {
      sendResponse(res, 400, { error: "messages fehlt" });
      return;
    }

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: contents,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
        topP: 0.95,
      }
    });

    const path = `/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

    const options = {
      hostname: "generativelanguage.googleapis.com",
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
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
  console.log(`Gemini Roblox Proxy läuft auf Port ${PORT}`);
});
