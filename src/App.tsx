import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { ExitIntentPrompt } from "./components/ExitIntentPrompt";
import { ScrollToTop } from "./components/ScrollToTop";
import Home from "./pages/Home";
import About from "./pages/About";
import Services from "./pages/Services";
import Approach from "./pages/Approach";
import Work from "./pages/Work";
import Contact from "./pages/Contact";
import Admin from "./pages/Admin";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import CookiePolicy from "./pages/CookiePolicy";
import Terms from "./pages/Terms";

export default function App() {
  return (
    <BrowserRouter>
      <CanonicalHostRedirect />
      <ScrollToTop />
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/services" element={<Services />} />
          <Route path="/approach" element={<Approach />} />
          <Route path="/work" element={<Work />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <ExitIntentPrompt />
    </BrowserRouter>
  );
}

function CanonicalHostRedirect() {
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "firstlightmarketing.co.uk"
  ) {
    window.location.replace(
      `https://www.firstlightmarketing.co.uk${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
  }

  return null;
}
