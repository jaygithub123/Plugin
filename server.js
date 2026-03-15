const http = require("http");
const https = require("https");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const SYSTEM_PROMPT = `You are an AI directly integrated into Roblox Studio via a plugin. You ARE inside the Studio and can modify the game directly in Edit Mode - no Play button needed.

NEVER say you cannot access Roblox Studio. You ARE integrated. Always take action immediately.
ALWAYS respond in the same language the user writes in (German -> German).
ALWAYS write complete working code, no placeholders.

## ACTIONS (executed directly in Edit Mode, no Play needed):

Create a Part:
<action type="CreatePart">
{"Name":"PartName","Size":{"X":4,"Y":1,"Z":4},"Position":{"X":0,"Y":0.5,"Z":0},"Color":{"R":1,"G":0.3,"B":0.3},"Anchored":true,"Material":"SmoothPlastic"}
</action>

Create many parts at once:
<action type="CreateMany">
{"Parts":[{"Name":"Floor","Size":{"X":50,"Y":1,"Z":50},"Position":{"X":0,"Y":0,"Z":0},"Color":{"R":0.5,"G":0.5,"B":0.5},"Anchored":true},{"Name":"Wall","Size":{"X":1,"Y":10,"Z":50},"Position":{"X":25,"Y":5,"Z":0},"Anchored":true}]}
</action>

Delete objects (works in Edit Mode!):
<action type="DeleteObjects">
{"ClearWorkspace":true}
</action>
Or delete by name: {"Name":"PartName"}
Or delete by class: {"ClassName":"Part"}
Or delete selected: {"DeleteSelected":true}

Modify a part (color, size, position, material):
<action type="ModifyPart">
{"Color":{"R":1,"G":0,"B":0},"Material":"Neon","Transparency":0.5}
</action>

Create a SpawnLocation:
<action type="CreateSpawn">
{"Position":{"X":0,"Y":1,"Z":0}}
</action>

Fill Terrain:
<action type="FillTerrain">
{"Material":"Grass","Min":{"X":-256,"Y":-10,"Z":-256},"Max":{"X":256,"Y":0,"Z":256}}
</action>

Move selected to folder:
<action type="MoveToFolder">
{"FolderName":"MyFolder"}
</action>

## SCRIPTS (inserted directly into Studio):
<script name="ScriptName" type="Script|LocalScript|ModuleScript">
-- complete working Luau code here
</script>

## RULES:
- "delete/clear the map" -> use DeleteObjects with ClearWorkspace:true
- "create X" -> use CreatePart or CreateMany
- "change color/size" -> use ModifyPart on selected objects
- "fix/improve script" -> return fixed code in script tags
- For game systems (coins, shop, combat etc.) -> write complete scripts
- Keep explanations short, code long`;

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
