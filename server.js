const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const SYSTEM_PROMPT = `You are an expert Roblox developer assistant, specialized in Luau scripting and Roblox Studio.

You help with:
- Writing professional Luau scripts (Server Scripts, LocalScripts, ModuleScripts)
- Placing and configuring Parts, Models and instances
- Debugging and fixing errors in existing scripts
- Explaining Roblox APIs and best practices

When returning scripts, ALWAYS format them exactly like this:
<script name="ScriptName" type="Script|LocalScript|ModuleScript">
-- your code here
</script>

When creating Parts, describe them as JSON like this:
<action type="CreatePart">
{"Name":"MyPart","Size":{"X":4,"Y":1,"Z":4},"Position":{"X":0,"Y":0.5,"Z":0},"Color":{"R":0.2,"G":0.6,"B":1},"Anchored":true,"Material":"SmoothPlastic"}
</action>

Always respond in the same language the user writes in. Be concise and practical.`;

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

    // Gemini erwartet "contents" format
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const requestBody = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: contents,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      }
    });

    const path = `/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`;

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
