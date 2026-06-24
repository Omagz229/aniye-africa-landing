const occasions = [
  "A birthday.",
  "A graduation.",
  "A new baby.",
  "An anniversary.",
  "A simple act of appreciation.",
];

export default function RelationshipStatement() {
  return (
    <section className="bg-cream py-16 md:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display font-semibold text-3xl sm:text-4xl text-ink leading-tight mb-10">
          Distance Shouldn&apos;t Stop You From Showing Up
        </h2>

        <ul className="space-y-3 mb-10" aria-label="Life occasions">
          {occasions.map((occasion) => (
            <li
              key={occasion}
              className="font-display italic text-xl sm:text-2xl text-stone"
            >
              {occasion}
            </li>
          ))}
        </ul>

        <div className="space-y-4 font-body text-stone text-lg leading-relaxed">
          <p>
            The people we care about don&apos;t always live in the same city,
            country, or region.
          </p>
          <p>
            But meaningful relationships are built through showing up for
            life&apos;s important moments.
          </p>
          <p className="text-ink font-medium">
            Aniy&eacute; Africa helps you do exactly that.
          </p>
        </div>
      </div>
    </section>
  );
}
