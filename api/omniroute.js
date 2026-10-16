export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = request.headers.authorization || "";
  if (!apiKey.startsWith("Bearer ")) {
    return response.status(401).json({ error: "Missing OmniRoute API key" });
  }

  const baseUrl = process.env.OMNIROUTE_BASE_URL || "https://api.omniroute.ai/v1";
  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey
      },
      body: JSON.stringify(request.body)
    });
    const body = await upstream.text();
    response.status(upstream.status);
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    return response.send(body);
  } catch (error) {
    return response.status(502).json({ error: `Could not reach OmniRoute: ${error.message}` });
  }
}
