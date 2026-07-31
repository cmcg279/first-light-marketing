function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);

  return parts.map((part, index) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return <strong key={index}>{bold[1]}</strong>;
    }

    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a key={index} href={link[2]} className="text-coral underline underline-offset-4">
          {link[1]}
        </a>
      );
    }

    return part;
  });
}

export function MarkdownContent({ body }: { body: string }) {
  const blocks = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6 font-sans text-lg leading-relaxed text-body/75">
      {blocks.map((block, index) => {
        const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (image) {
          return (
            <figure key={index} className="overflow-hidden rounded-lg border border-body/10 bg-white">
              <img src={image[2]} alt={image[1]} className="w-full object-cover" />
              {image[1] && (
                <figcaption className="px-4 py-3 font-sans text-sm text-body/50">{image[1]}</figcaption>
              )}
            </figure>
          );
        }

        if (block.startsWith("### ")) {
          return <h3 key={index} className="font-serif text-2xl font-bold text-body">{block.slice(4)}</h3>;
        }

        if (block.startsWith("## ")) {
          return <h2 key={index} className="font-serif text-3xl font-bold text-body">{block.slice(3)}</h2>;
        }

        if (block.includes("\n- ")) {
          const items = block.split("\n").filter((line) => line.startsWith("- "));
          return (
            <ul key={index} className="list-disc space-y-2 pl-6">
              {items.map((item) => (
                <li key={item}>{renderInline(item.slice(2))}</li>
              ))}
            </ul>
          );
        }

        return <p key={index}>{renderInline(block)}</p>;
      })}
    </div>
  );
}
