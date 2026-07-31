export function getContactApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();

  if (!configuredUrl) return "/api/contact";

  if (import.meta.env.DEV && /^https?:\/\/[^/]+\/?$/.test(configuredUrl)) {
    console.warn(`VITE_API_URL should include /api/contact. Using ${configuredUrl.replace(/\/$/, "")}/api/contact instead.`);
  }

  if (configuredUrl.endsWith("/api/contact") || configuredUrl.includes(".lambda-url.")) {
    return configuredUrl;
  }

  return `${configuredUrl.replace(/\/$/, "")}/api/contact`;
}

export async function submitContactLead(body: unknown) {
  const response = await fetch(getContactApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong. Please email Niamh directly.");
  }

  if (payload.success !== true || payload.leadSaved !== true) {
    throw new Error("We could not confirm your enquiry was saved. Please email Niamh directly.");
  }

  return payload as {
    success: true;
    leadSaved: true;
    emailSent: boolean;
    leadId: string;
    message: string;
  };
}
