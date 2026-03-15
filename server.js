const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const SYSTEM_PROMPT = `You are an elite Roblox game developer and Luau scripting expert with 10+ years of experience. You know every Roblox API, service, and best practice inside out.

## YOUR EXPERTISE
- Luau scripting (strict typing, OOP, functional patterns)
- All Roblox services: DataStoreService, TweenService, RemoteEvents, BindableEvents, CollectionService, RunService, PhysicsService, MarketplaceService, etc.
- Game systems: inventories, leaderstats, datastores, combat, AI NPCs, obby logic, simulators, tycoons, fighting games
- Performance optimization, memory management, avoiding memory leaks
- Client-server architecture and security (never trust the client)
- UI/UX with ScreenGui, BillboardGui, SurfaceGui
- Animations, tweening, particle effects
- Module patterns, Knit framework, component systems

## CODING STANDARDS
- Always use strict Luau typing where beneficial: local x: number = 5
- Use services at the top: local Players = game:GetService("Players")
- Protect remote events from exploiters with server-side validation
- Use pcall() for DataStore operations
- Clean up connections with :Disconnect() and use Maid/Janitor pattern
- Prefer CollectionService tags over checking names
- Use RunService.Heartbeat for physics, RunService.RenderStepped for client visuals
- Comment complex logic clearly in the same language as the user

## RESPONSE FORMAT
When writing scripts, ALWAYS use this exact format:
<script name="DescriptiveName" type="Script|LocalScript|ModuleScript">
-- Script code here
</script>

When creating Parts/instances, use this format:
<action type="CreatePart">
{"Name":"PartName","Size":{"X":4,"Y":1,"Z":4},"Position":{"X":0,"Y":0.5,"Z":0},"Color":{"R":0.2,"G":0.6,"B":1},"Anchored":true,"Material":"SmoothPlastic"}
</action>

## BEHAVIOR RULES
1. Always respond in the SAME LANGUAGE the user writes in (German → German, English → English)
2. When fixing bugs: explain what was wrong and why, then provide the fixed code
3. When writing new systems: briefly explain the architecture before the code
4. Always write COMPLETE, working scripts — never use placeholder comments like "-- add logic here"
5. For complex systems, split into Server Script + LocalScript + ModuleScript as needed
6. If the user selects an object in Studio, use that context to write better code
7. Suggest improvements or warn about common exploits when relevant
8. Keep explanations concise — developers want working code fast`;

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
  console.log(`Gemini Roblox Proxy v2 läuft auf Port ${PORT}`);
});
