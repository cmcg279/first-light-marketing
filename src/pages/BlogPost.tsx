import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MarkdownContent } from "../components/MarkdownContent";
import { Seo } from "../components/Seo";
import { getPublicBlogPost, getPublicContent } from "../lib/adminApi";
import type { BlogPost as BlogPostType } from "../types/admin";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getPublicContent(), getPublicBlogPost(slug)])
      .then(([content, nextPost]) => {
        if (cancelled) return;
        setEnabled(Boolean(content.settings.blogEnabled));
        setPost(nextPost);
      })
      .catch(() => {
        if (!cancelled) setPost(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <>
        <Seo title="Blog post" description="Marketing notes and practical ideas from First Light Marketing." path={`/blog/${slug}`} />
        <section className="min-h-[60vh] bg-cream px-6 py-20" />
      </>
    );
  }

  if (!enabled || !post) {
    return (
      <>
        <Seo title="Post not found" description="This blog post could not be found." path={`/blog/${slug}`} />
        <section className="min-h-[60vh] bg-cream px-6 py-20 text-center">
          <h1 className="font-serif text-4xl font-bold text-body">Post not found</h1>
          <Link to="/blog" className="mt-8 inline-flex rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white">
            Back to blog
          </Link>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo
        title={post.title}
        description={post.excerpt}
        image={post.coverImage || undefined}
        path={`/blog/${post.slug}`}
        type="article"
      />
      <article className="bg-cream px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <Link to="/blog" className="font-sans text-sm font-semibold text-coral">Back to blog</Link>
          <p className="mt-10 font-sans text-xs font-semibold uppercase tracking-[0.2em] text-body/45">
            {post.publishedAt ? formatDate(post.publishedAt) : "Blog"}
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold leading-tight text-body">{post.title}</h1>
          <p className="mt-6 font-sans text-xl leading-relaxed text-body/65">{post.excerpt}</p>
        </div>

        {post.coverImage && (
          <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-lg border border-body/10 bg-white">
            <img src={post.coverImage} alt={post.coverAlt || post.title} className="max-h-[620px] w-full object-cover" />
          </div>
        )}

        <div className="mx-auto mt-12 max-w-3xl">
          {post.bodyHtml ? (
            <div
              className="substack-post-content space-y-6 font-sans text-lg leading-relaxed text-body/75"
              dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
            />
          ) : (
            <MarkdownContent body={post.body} />
          )}
          {post.externalUrl && (
            <a
              href={post.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex rounded-full border border-body/15 px-5 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider text-body/55 transition hover:border-coral hover:text-coral"
            >
              View original on Substack
            </a>
          )}
        </div>
      </article>
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
