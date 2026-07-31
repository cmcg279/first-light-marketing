import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";
import { getPublicBlogPosts, getPublicContent } from "../lib/adminApi";
import type { BlogPost } from "../types/admin";

export default function Blog() {
  const [enabled, setEnabled] = useState(false);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getPublicContent(), getPublicBlogPosts()])
      .then(([content, nextPosts]) => {
        if (cancelled) return;
        setEnabled(Boolean(content.settings.blogEnabled));
        setPosts(nextPosts);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <>
        <Seo title="Marketing blog" description="Marketing notes and practical ideas from First Light Marketing." path="/blog" />
        <section className="min-h-[60vh] bg-cream px-6 py-20" />
      </>
    );
  }

  if (!enabled) {
    return (
      <>
        <Seo title="Marketing blog" description="Marketing notes and practical ideas from First Light Marketing." path="/blog" />
        <section className="min-h-[60vh] bg-cream px-6 py-20 text-center">
          <h1 className="font-serif text-4xl font-bold text-body">Blog coming soon</h1>
          <Link to="/" className="mt-8 inline-flex rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white">
            Back home
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo
        title="Marketing blog"
        description="Short, useful posts on campaigns, content, launches and making marketing feel clearer."
        path="/blog"
      />
      <section className="bg-cream px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-coral">Blog</p>
          <h1 className="mt-3 font-serif text-5xl font-bold leading-tight text-body">Marketing notes and practical ideas.</h1>
          <p className="mt-5 max-w-2xl font-sans text-lg leading-relaxed text-body/65">
            Short, useful posts on campaigns, content, launches and making marketing feel clearer.
          </p>

          {posts.length === 0 ? (
            <div className="mt-12 rounded-lg border border-body/10 bg-white p-8">
              <p className="font-sans text-body/60">No posts published yet.</p>
            </div>
          ) : (
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link key={post.slug} to={`/blog/${post.slug}`} className="group overflow-hidden rounded-lg border border-body/10 bg-white transition hover:-translate-y-1 hover:shadow-lg">
                  {post.coverImage && (
                    <img src={post.coverImage} alt={post.coverAlt || post.title} className="aspect-[4/3] w-full object-cover" />
                  )}
                  <div className="p-6">
                    <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-body/40">
                      {post.publishedAt ? formatDate(post.publishedAt) : "Published"}
                    </p>
                    <h2 className="mt-3 font-serif text-2xl font-bold leading-tight text-body group-hover:text-coral">{post.title}</h2>
                    <p className="mt-4 font-sans text-sm leading-relaxed text-body/60">{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
