export function TrustedBy({ brands }: { brands: readonly string[] }) {
  const logoByBrand: Record<string, string> = {
    "Kukoon": "logos/clients/kukoon.png",
    "Nearby": "logos/clients/nearby.png",
    "Forest Feast": "logos/clients/forest-feast.png",
    "S&W Wholesale": "logos/clients/sw-wholesale.png",
    "Belfast Zoo": "logos/clients/belfast-zoo.png",
    "Cancer Council NSW": "logos/clients/cancer-council-nsw.png",
    "111SKIN": "logos/clients/111skin.png",
    "Roamless": "logos/clients/roamless.png",
    "ByBabes": "logos/clients/by-babes.png",
    "World of Books": "logos/clients/world-of-books.png",
    "Saily": "logos/clients/saily.png",
    "Nibbed": "logos/clients/nibbed.png",
    "Whatnot": "logos/clients/whatnot.png",
    "Seacra": "logos/clients/seacra.png",
    "Travelzoo": "logos/clients/travelzoo.png",
    "Pharma Plus": "logos/clients/pharma-plus.png",
  };
  const largerLogoBrands = new Set([
    "111SKIN",
    "Roamless",
    "ByBabes",
    "World of Books",
    "Saily",
    "Nibbed",
    "Whatnot",
    "Seacra",
    "Travelzoo",
    "Pharma Plus",
  ]);

  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <p className="mb-8 text-center font-sans text-xs font-semibold uppercase tracking-[0.2em] text-body/50">
        Brands I've worked with
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-7">
        {brands.map((b) => (
          <div key={b} className="flex h-12 min-w-[110px] items-center justify-center">
            {logoByBrand[b] ? (
              <img
                src={logoByBrand[b]}
                alt={b}
                className={`w-auto object-contain opacity-55 grayscale transition-all hover:opacity-85 hover:grayscale-0 ${
                  largerLogoBrands.has(b) ? "max-h-12 max-w-[160px]" : "max-h-10 max-w-[130px]"
                }`}
              />
            ) : (
              <span className="font-serif text-lg font-semibold italic text-body/50 transition-colors hover:text-body/70">
                {b}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
