import { useState, FormEvent } from "react";
import { CONTACT } from "../content/site";

export function ContactForm({ theme }: { theme?: "cream" | "coral" }) {
  const isCoral = theme === "coral";
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error("API URL not configured");

      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), message: form.message.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong");
      }

      setStatus("success");
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "success") {
    return (
      <div className={`rounded-2xl p-8 text-center ${isCoral ? "border border-off-white/30 bg-white/10" : "border border-coral/20 bg-coral/[0.03]"}`}>
        <p className={`mb-2 font-serif text-2xl font-semibold ${isCoral ? "text-off-white" : "text-body"}`}>Thanks for reaching out!</p>
        <p className={`font-sans text-base ${isCoral ? "text-off-white/80" : "text-body/60"}`}>I'll get back to you as soon as I can.</p>
      </div>
    );
  }

  const labelClass = isCoral
    ? "block font-sans text-sm font-medium text-off-white/80"
    : "block font-sans text-sm font-medium text-body/70";

  const inputClass = isCoral
    ? "mt-1.5 block w-full rounded-xl border border-off-white/30 bg-white/90 px-4 py-3 font-sans text-base text-body placeholder:text-body/30 focus:border-off-white focus:outline-none focus:ring-2 focus:ring-off-white/30 transition"
    : "mt-1.5 block w-full rounded-xl border border-body/15 bg-white/70 px-4 py-3 font-sans text-base text-body placeholder:text-body/30 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 transition";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="name" className={labelClass}>Name</label>
        <input id="name" type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="Your name" />
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} placeholder="you@example.com" />
      </div>
      <div>
        <label htmlFor="message" className={labelClass}>Message</label>
        <textarea id="message" required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={`${inputClass} resize-y`} placeholder="Tell me about your project..." />
      </div>

      {status === "error" && (
        <div className={`rounded-xl px-4 py-3 ${isCoral ? "border border-off-white/40 bg-white/10" : "border border-coral/30 bg-coral/[0.05]"}`}>
          <p className={`font-sans text-sm ${isCoral ? "text-off-white" : "text-coral"}`}>{errorMsg}</p>
          <p className={`mt-1 font-sans text-sm ${isCoral ? "text-off-white/70" : "text-body/50"}`}>
            Or email me:{" "}
            <a href={`mailto:${CONTACT.email}`} className={`font-medium underline ${isCoral ? "text-off-white" : "text-coral"}`}>niamh@firstlightmarketing.co.uk</a>
          </p>
        </div>
      )}

      <button type="submit" disabled={status === "sending"} className={`w-full rounded-full px-6 py-3.5 font-sans text-base font-semibold uppercase tracking-wider transition-all disabled:opacity-50 ${
        isCoral
          ? "bg-off-white text-coral hover:bg-white hover:shadow-lg"
          : "bg-coral text-off-white hover:bg-coral-700 hover:shadow-lg"
      }`}>
        {status === "sending" ? "Sending..." : "Send message"}
      </button>
    </form>
  );
}
